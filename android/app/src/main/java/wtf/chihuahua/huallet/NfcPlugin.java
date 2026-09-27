package wtf.chihuahua.huallet;

import android.app.Activity;
import android.content.ComponentName;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.nfc.NdefMessage;
import android.nfc.NdefRecord;
import android.nfc.NfcAdapter;
import android.nfc.Tag;
import android.nfc.cardemulation.CardEmulation;
import android.nfc.tech.Ndef;
import android.os.Bundle;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;

/**
 * NFC payment requests. Receive: the phone emulates an NDEF tag holding a
 * payment URI (see NdefHceService). Send: reader mode reads that URI from
 * another phone or from a physical NFC tag and hands it to the page.
 * Nothing secret ever goes over NFC.
 */
@CapacitorPlugin(name = "HualletNfc")
public class NfcPlugin extends Plugin {

    private boolean reading;
    private boolean emulating;

    private NfcAdapter adapter() {
        return NfcAdapter.getDefaultAdapter(getContext());
    }

    private ComponentName hceComponent() {
        return new ComponentName(getContext(), NdefHceService.class);
    }

    @PluginMethod
    public void status(PluginCall call) {
        NfcAdapter a = adapter();
        JSObject r = new JSObject();
        r.put("supported", a != null);
        r.put("enabled", a != null && a.isEnabled());
        r.put("hce", getContext().getPackageManager().hasSystemFeature(PackageManager.FEATURE_NFC_HOST_CARD_EMULATION));
        call.resolve(r);
    }

    @PluginMethod
    public void startEmulation(PluginCall call) {
        String uri = call.getString("uri");
        if (uri == null || uri.isEmpty()) {
            call.reject("Missing uri");
            return;
        }
        try {
            NdefMessage msg = new NdefMessage(NdefRecord.createUri(Uri.parse(uri)));
            NdefHceService.TAG.setMessage(msg.toByteArray());
            emulating = true;
            preferOurService(true);
            call.resolve();
        } catch (Exception e) {
            call.reject("Could not start NFC: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void stopEmulation(PluginCall call) {
        stopEmulating();
        call.resolve();
    }

    @PluginMethod
    public void startReading(PluginCall call) {
        NfcAdapter a = adapter();
        if (a == null) {
            call.reject("This phone has no NFC", "unsupported");
            return;
        }
        if (!a.isEnabled()) {
            call.reject("NFC is turned off", "disabled");
            return;
        }
        stopEmulating();
        reading = true;
        enableReader();
        call.resolve();
    }

    @PluginMethod
    public void stopReading(PluginCall call) {
        reading = false;
        Activity act = getActivity();
        NfcAdapter a = adapter();
        if (a != null) act.runOnUiThread(() -> a.disableReaderMode(act));
        call.resolve();
    }

    @Override
    protected void handleOnResume() {
        if (reading) enableReader();
        if (emulating) preferOurService(true);
    }

    @Override
    protected void handleOnPause() {
        NfcAdapter a = adapter();
        if (a != null && reading) a.disableReaderMode(getActivity());
        if (emulating) preferOurService(false);
    }

    private void stopEmulating() {
        NdefHceService.TAG.setMessage(null);
        if (emulating) preferOurService(false);
        emulating = false;
    }

    private void preferOurService(boolean on) {
        NfcAdapter a = adapter();
        if (a == null) return;
        Activity act = getActivity();
        act.runOnUiThread(() -> {
            try {
                CardEmulation ce = CardEmulation.getInstance(a);
                if (on) ce.setPreferredService(act, hceComponent());
                else ce.unsetPreferredService(act);
            } catch (Exception ignored) {}
        });
    }

    private void enableReader() {
        NfcAdapter a = adapter();
        if (a == null) return;
        Activity act = getActivity();
        Bundle extras = new Bundle();
        extras.putInt(NfcAdapter.EXTRA_READER_PRESENCE_CHECK_DELAY, 250);
        act.runOnUiThread(() ->
            a.enableReaderMode(
                act,
                this::onTag,
                NfcAdapter.FLAG_READER_NFC_A | NfcAdapter.FLAG_READER_NFC_B | NfcAdapter.FLAG_READER_NFC_F | NfcAdapter.FLAG_READER_NFC_V,
                extras
            )
        );
    }

    private void onTag(Tag tag) {
        JSObject ev = new JSObject();
        Ndef ndef = Ndef.get(tag);
        if (ndef == null) {
            ev.put("error", "This tag has no payment request");
            notifyListeners("tag", ev);
            return;
        }
        try {
            ndef.connect();
            NdefMessage msg = ndef.getNdefMessage();
            ndef.close();
            String value = msg == null ? null : firstText(msg);
            if (value == null) ev.put("error", "This tag has no payment request");
            else ev.put("value", value);
        } catch (Exception e) {
            ev.put("error", "Hold the phones together until it vibrates");
        }
        notifyListeners("tag", ev);
    }

    /** First URI or text record, as a string. */
    private static String firstText(NdefMessage msg) {
        for (NdefRecord r : msg.getRecords()) {
            Uri u = r.toUri();
            if (u != null) return u.toString();
            if (r.getTnf() == NdefRecord.TNF_WELL_KNOWN && Arrays.equals(r.getType(), NdefRecord.RTD_TEXT)) {
                byte[] p = r.getPayload();
                if (p.length == 0) continue;
                int langLen = p[0] & 0x3F;
                boolean utf16 = (p[0] & 0x80) != 0;
                return new String(p, 1 + langLen, p.length - 1 - langLen, utf16 ? StandardCharsets.UTF_16 : StandardCharsets.UTF_8);
            }
        }
        return null;
    }
}
