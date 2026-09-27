package wtf.chihuahua.huallet;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyPermanentlyInvalidatedException;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import androidx.annotation.NonNull;
import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/**
 * Biometric unlock. The wallet password is encrypted with an AES-256-GCM key
 * that lives in the Android Keystore (hardware-backed where available) and can
 * only be used right after a strong biometric check: the cipher itself is
 * unlocked by BiometricPrompt, so the password cannot be read without one.
 * Enrolling a new fingerprint or face invalidates the key.
 */
@CapacitorPlugin(name = "HualletBiometric")
public class BiometricPlugin extends Plugin {

    private static final String KEY_ALIAS = "huallet-biometric-v1";
    private static final String PREFS = "huallet-biometric";
    private static final String CIPHERTEXT = "ciphertext";
    private static final String IV = "iv";
    private static final int AUTHENTICATORS = BiometricManager.Authenticators.BIOMETRIC_STRONG;

    private SharedPreferences prefs() {
        return getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    @PluginMethod
    public void status(PluginCall call) {
        int can = BiometricManager.from(getContext()).canAuthenticate(AUTHENTICATORS);
        String reason;
        switch (can) {
            case BiometricManager.BIOMETRIC_SUCCESS:
                reason = "ok";
                break;
            case BiometricManager.BIOMETRIC_ERROR_NONE_ENROLLED:
                reason = "none-enrolled";
                break;
            case BiometricManager.BIOMETRIC_ERROR_NO_HARDWARE:
            case BiometricManager.BIOMETRIC_ERROR_HW_UNAVAILABLE:
                reason = "no-hardware";
                break;
            default:
                reason = "unavailable";
        }
        JSObject r = new JSObject();
        r.put("available", can == BiometricManager.BIOMETRIC_SUCCESS);
        r.put("reason", reason);
        r.put("enabled", prefs().contains(CIPHERTEXT) && hasKey());
        call.resolve(r);
    }

    @PluginMethod
    public void enable(PluginCall call) {
        String secret = call.getString("secret");
        if (secret == null || secret.isEmpty()) {
            call.reject("Missing secret");
            return;
        }
        try {
            deleteKey();
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, createKey());
            prompt(call, cipher, call.getString("title", "Enable biometric unlock"), (c) -> {
                byte[] out = c.doFinal(secret.getBytes(StandardCharsets.UTF_8));
                prefs()
                    .edit()
                    .putString(CIPHERTEXT, Base64.encodeToString(out, Base64.NO_WRAP))
                    .putString(IV, Base64.encodeToString(c.getIV(), Base64.NO_WRAP))
                    .apply();
                call.resolve();
            });
        } catch (Exception e) {
            call.reject("Could not set up biometric unlock: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void unlock(PluginCall call) {
        String ct = prefs().getString(CIPHERTEXT, null);
        String iv = prefs().getString(IV, null);
        if (ct == null || iv == null || !hasKey()) {
            call.reject("Biometric unlock is not set up", "not-enabled");
            return;
        }
        try {
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, getKey(), new GCMParameterSpec(128, Base64.decode(iv, Base64.NO_WRAP)));
            prompt(call, cipher, call.getString("title", "Unlock Huallet"), (c) -> {
                byte[] out = c.doFinal(Base64.decode(ct, Base64.NO_WRAP));
                JSObject r = new JSObject();
                r.put("secret", new String(out, StandardCharsets.UTF_8));
                call.resolve(r);
            });
        } catch (KeyPermanentlyInvalidatedException e) {
            clear();
            call.reject("Biometrics changed on this device: unlock with your password and turn biometric unlock on again.", "invalidated");
        } catch (Exception e) {
            call.reject("Biometric unlock failed: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void disable(PluginCall call) {
        clear();
        call.resolve();
    }

    private interface OnCipher {
        void run(Cipher cipher) throws Exception;
    }

    private void prompt(PluginCall call, Cipher cipher, String title, OnCipher onSuccess) {
        getActivity()
            .runOnUiThread(() -> {
                BiometricPrompt.PromptInfo info = new BiometricPrompt.PromptInfo.Builder()
                    .setTitle(title)
                    .setNegativeButtonText(call.getString("cancel", "Use password"))
                    .setAllowedAuthenticators(AUTHENTICATORS)
                    .build();
                BiometricPrompt bp = new BiometricPrompt(
                    getActivity(),
                    ContextCompat.getMainExecutor(getContext()),
                    new BiometricPrompt.AuthenticationCallback() {
                        @Override
                        public void onAuthenticationSucceeded(@NonNull BiometricPrompt.AuthenticationResult result) {
                            BiometricPrompt.CryptoObject co = result.getCryptoObject();
                            if (co == null || co.getCipher() == null) {
                                call.reject("No cipher after authentication");
                                return;
                            }
                            try {
                                onSuccess.run(co.getCipher());
                            } catch (Exception e) {
                                call.reject("Biometric unlock failed: " + e.getMessage(), e);
                            }
                        }

                        @Override
                        public void onAuthenticationError(int code, @NonNull CharSequence msg) {
                            boolean cancelled =
                                code == BiometricPrompt.ERROR_NEGATIVE_BUTTON ||
                                code == BiometricPrompt.ERROR_USER_CANCELED ||
                                code == BiometricPrompt.ERROR_CANCELED;
                            call.reject(msg.toString(), cancelled ? "cancelled" : "error-" + code);
                        }
                    }
                );
                bp.authenticate(info, new BiometricPrompt.CryptoObject(cipher));
            });
    }

    private KeyStore keyStore() throws Exception {
        KeyStore ks = KeyStore.getInstance("AndroidKeyStore");
        ks.load(null);
        return ks;
    }

    private boolean hasKey() {
        try {
            return keyStore().containsAlias(KEY_ALIAS);
        } catch (Exception e) {
            return false;
        }
    }

    private SecretKey getKey() throws Exception {
        return (SecretKey) keyStore().getKey(KEY_ALIAS, null);
    }

    private SecretKey createKey() throws Exception {
        KeyGenerator kg = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        KeyGenParameterSpec.Builder spec = new KeyGenParameterSpec.Builder(
            KEY_ALIAS,
            KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT
        )
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(256)
            .setUserAuthenticationRequired(true)
            .setInvalidatedByBiometricEnrollment(true);
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.R) {
            spec.setUserAuthenticationParameters(0, KeyProperties.AUTH_BIOMETRIC_STRONG);
        }
        kg.init(spec.build());
        return kg.generateKey();
    }

    private void deleteKey() {
        try {
            keyStore().deleteEntry(KEY_ALIAS);
        } catch (Exception ignored) {}
    }

    private void clear() {
        prefs().edit().clear().apply();
        deleteKey();
    }
}
