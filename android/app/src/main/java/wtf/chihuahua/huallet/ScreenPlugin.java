package wtf.chihuahua.huallet;

import android.view.WindowManager;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Full brightness while a QR code is shown full screen, so scanners read it easily. */
@CapacitorPlugin(name = "HualletScreen")
public class ScreenPlugin extends Plugin {

    @PluginMethod
    public void setMaxBrightness(PluginCall call) {
        boolean on = Boolean.TRUE.equals(call.getBoolean("on", false));
        getActivity()
            .runOnUiThread(() -> {
                WindowManager.LayoutParams lp = getActivity().getWindow().getAttributes();
                // BRIGHTNESS_OVERRIDE_NONE hands control back to the system setting.
                lp.screenBrightness = on ? WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_FULL : WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_NONE;
                getActivity().getWindow().setAttributes(lp);
                call.resolve();
            });
    }

    @Override
    protected void handleOnPause() {
        WindowManager.LayoutParams lp = getActivity().getWindow().getAttributes();
        if (lp.screenBrightness != WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_NONE) {
            lp.screenBrightness = WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_NONE;
            getActivity().getWindow().setAttributes(lp);
        }
    }
}
