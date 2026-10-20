package in.sehatra.app;

import android.os.Bundle;
import android.view.View;
import android.view.WindowManager;
import android.webkit.WebView;
import androidx.activity.OnBackPressedCallback;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.WebViewListener;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Health records on screen: no screenshots, screen recordings or recent-apps thumbnails.
        getWindow().setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE);

        WebView webView = getBridge().getWebView();

        // Android 15+ draws apps edge-to-edge. The website doesn't pad for the status / navigation bars,
        // so keep the WebView clear of them (and of the keyboard) here instead.
        View content = (View) webView.getParent();
        content.setBackgroundColor(0xFFFBF7F0); // brand cream behind the status / navigation bars
        ViewCompat.setOnApplyWindowInsetsListener(content, (v, insets) -> {
            Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout() | WindowInsetsCompat.Type.ime());
            v.setPadding(bars.left, bars.top, bars.right, bars.bottom);
            return WindowInsetsCompat.CONSUMED;
        });

        // Back steps through the site's history like a browser; only on the first page does it leave the app.
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (webView.canGoBack()) webView.goBack();
                else moveTaskToBack(true);
            }
        });

        // Keep the splash up until the first page has painted instead of flashing an empty screen
        // (launchShowDuration in capacitor.config.json is only the upper bound).
        getBridge().addWebViewListener(new WebViewListener() {
            private boolean hidden;

            @Override
            public void onPageLoaded(WebView view) {
                if (hidden) return;
                hidden = true;
                view.postDelayed(() -> view.evaluateJavascript("window.Capacitor && Capacitor.Plugins.SplashScreen && Capacitor.Plugins.SplashScreen.hide({ fadeOutDuration: 200 })", null), 150);
            }
        });
    }
}
