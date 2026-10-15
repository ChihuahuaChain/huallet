package wtf.chihuahua.huallet;

import android.annotation.SuppressLint;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.net.Uri;
import android.text.TextUtils;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;
import androidx.activity.OnBackPressedCallback;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;

/**
 * In-app dApp browser. Opens a full-screen WebView overlay on top of the wallet
 * UI and injects the standard window.huallet provider (assets/dappInject.js)
 * into every page it loads. Provider requests are relayed to the wallet core in
 * the main WebView via the "providerRequest" event, carrying the page's origin
 * as stamped here (never trusted from the page); the core's answer comes back
 * through respond(). The overlay is hidden while an approval screen shows in the
 * main WebView (setOverlayVisible), so the user reviews and signs there.
 */
@CapacitorPlugin(name = "HualletDapp")
public class DappPlugin extends Plugin {

    private static final int BAR_COLOR = Color.parseColor("#1b1b1f");

    private FrameLayout overlay;
    private WebView webView;
    private TextView hostLabel;
    private volatile String currentOrigin = "";
    private String injectJs;
    private OnBackPressedCallback backCallback;

    @PluginMethod
    public void open(PluginCall call) {
        final String url = call.getString("url");
        if (url == null || url.isEmpty()) {
            call.reject("Missing url");
            return;
        }
        getActivity().runOnUiThread(() -> {
            try {
                ensureOverlay();
                overlay.setVisibility(View.VISIBLE);
                if (backCallback != null) backCallback.setEnabled(true);
                webView.loadUrl(url);
                call.resolve();
            } catch (Exception e) {
                call.reject("Could not open the in-app browser", e);
            }
        });
    }

    @PluginMethod
    public void close(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            removeOverlay();
            call.resolve();
        });
    }

    @PluginMethod
    public void respond(PluginCall call) {
        final String message = call.getString("message");
        getActivity().runOnUiThread(() -> {
            if (webView != null && message != null) {
                webView.evaluateJavascript("window.__hualletDeliver && window.__hualletDeliver(" + message + ")", null);
            }
            call.resolve();
        });
    }

    @PluginMethod
    public void setOverlayVisible(PluginCall call) {
        final boolean visible = Boolean.TRUE.equals(call.getBoolean("visible", true));
        getActivity().runOnUiThread(() -> {
            if (overlay != null) overlay.setVisibility(visible ? View.VISIBLE : View.GONE);
            if (backCallback != null) backCallback.setEnabled(visible && overlay != null);
            call.resolve();
        });
    }

    @PluginMethod
    public void keystoreChanged(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            if (webView != null) {
                webView.evaluateJavascript("window.__hualletDeliver && window.__hualletDeliver({event:'keystorechange'})", null);
            }
            call.resolve();
        });
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void ensureOverlay() throws IOException {
        if (overlay != null) return;
        if (injectJs == null) injectJs = readAsset("dappInject.js");

        webView = new WebView(getActivity());
        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setSupportMultipleWindows(false);
        webView.addJavascriptInterface(new NativeBridge(), "HualletNative");
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageStarted(WebView view, String url, Bitmap favicon) {
                currentOrigin = originOf(url);
                if (hostLabel != null) hostLabel.setText(hostOf(url));
                // Install the provider as early as the page context exists. dApps
                // also wait for the "huallet#initialized" event, so late pickup is fine.
                view.evaluateJavascript(injectJs, null);
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                String scheme = request.getUrl().getScheme();
                // Keep http(s) inside the browser; let the OS handle anything else.
                return scheme != null && !scheme.equals("http") && !scheme.equals("https");
            }
        });

        TextView back = barButton("‹", 30);
        back.setContentDescription("Back");
        back.setOnClickListener(v -> {
            if (webView != null && webView.canGoBack()) webView.goBack();
        });

        hostLabel = new TextView(getActivity());
        hostLabel.setTextColor(Color.WHITE);
        hostLabel.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15);
        hostLabel.setSingleLine(true);
        hostLabel.setEllipsize(TextUtils.TruncateAt.END);
        hostLabel.setGravity(Gravity.CENTER);
        hostLabel.setLayoutParams(new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));

        TextView close = barButton("✕", 20);
        close.setContentDescription("Close");
        close.setOnClickListener(v -> removeOverlay());

        LinearLayout bar = new LinearLayout(getActivity());
        bar.setOrientation(LinearLayout.HORIZONTAL);
        bar.setGravity(Gravity.CENTER_VERTICAL);
        bar.setBackgroundColor(BAR_COLOR);
        bar.setMinimumHeight(dp(52));
        bar.setPadding(dp(4), 0, dp(4), 0);
        bar.addView(back);
        bar.addView(hostLabel);
        bar.addView(close);

        LinearLayout column = new LinearLayout(getActivity());
        column.setOrientation(LinearLayout.VERTICAL);
        column.setBackgroundColor(Color.WHITE);
        column.addView(bar, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        column.addView(webView, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));

        overlay = new FrameLayout(getActivity());
        // The app draws edge to edge: the overlay paints the system-bar areas in
        // the bar color and pads its content clear of the status bar, display
        // cutout and navigation bar. The keyboard is not padded here: Capacitor's
        // SystemBars already pads the decor view by the IME height, and adding it
        // again would leave a keyboard-sized gap.
        overlay.setBackgroundColor(BAR_COLOR);
        // Swallow touches so they never reach the wallet UI behind the overlay.
        overlay.setClickable(true);
        overlay.addView(column, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        ViewCompat.setOnApplyWindowInsetsListener(overlay, (v, insets) -> {
            Insets i = insets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
            v.setPadding(i.left, i.top, i.right, i.bottom);
            return WindowInsetsCompat.CONSUMED;
        });

        ViewGroup content = getActivity().findViewById(android.R.id.content);
        content.addView(overlay, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        ViewCompat.requestApplyInsets(overlay);

        backCallback = new OnBackPressedCallback(false) {
            @Override
            public void handleOnBackPressed() {
                if (webView != null && webView.canGoBack()) webView.goBack();
                else removeOverlay();
            }
        };
        getActivity().getOnBackPressedDispatcher().addCallback(backCallback);
    }

    private void removeOverlay() {
        if (backCallback != null) {
            backCallback.setEnabled(false);
            backCallback.remove();
            backCallback = null;
        }
        if (overlay != null) {
            ViewGroup content = getActivity().findViewById(android.R.id.content);
            content.removeView(overlay);
        }
        if (webView != null) {
            webView.loadUrl("about:blank");
            webView.destroy();
            webView = null;
        }
        overlay = null;
        hostLabel = null;
        currentOrigin = "";
    }

    private String readAsset(String name) throws IOException {
        try (InputStream is = getContext().getAssets().open(name); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            byte[] buf = new byte[8192];
            int n;
            while ((n = is.read(buf)) != -1) out.write(buf, 0, n);
            return out.toString("UTF-8");
        }
    }

    /** A flat, square, ripple-backed icon button for the browser bar. */
    private TextView barButton(String glyph, int sizeSp) {
        TextView b = new TextView(getActivity());
        b.setText(glyph);
        b.setTextColor(Color.WHITE);
        b.setTextSize(TypedValue.COMPLEX_UNIT_SP, sizeSp);
        b.setGravity(Gravity.CENTER);
        b.setClickable(true);
        b.setFocusable(true);
        TypedValue ripple = new TypedValue();
        getActivity().getTheme().resolveAttribute(android.R.attr.selectableItemBackgroundBorderless, ripple, true);
        b.setBackgroundResource(ripple.resourceId);
        b.setLayoutParams(new LinearLayout.LayoutParams(dp(48), dp(48)));
        return b;
    }

    private int dp(int value) {
        return Math.round(value * getContext().getResources().getDisplayMetrics().density);
    }

    private static String originOf(String url) {
        try {
            Uri u = Uri.parse(url);
            if (u.getScheme() == null || u.getHost() == null) return "";
            String origin = u.getScheme() + "://" + u.getHost();
            if (u.getPort() != -1) origin += ":" + u.getPort();
            return origin;
        } catch (Exception e) {
            return "";
        }
    }

    private static String hostOf(String url) {
        try {
            String host = Uri.parse(url).getHost();
            return host == null ? url : host;
        } catch (Exception e) {
            return url;
        }
    }

    private class NativeBridge {
        @JavascriptInterface
        public void postMessage(String json) {
            JSObject event = new JSObject();
            event.put("origin", currentOrigin);
            event.put("message", json);
            notifyListeners("providerRequest", event);
        }
    }
}
