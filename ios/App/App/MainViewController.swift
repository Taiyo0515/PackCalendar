import Capacitor
import UIKit

class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(PackBridgePlugin())
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        // Let the page background show through (follows light/dark).
        view.backgroundColor = .systemBackground
        webView?.isOpaque = false
        webView?.backgroundColor = .clear
        webView?.scrollView.backgroundColor = .clear
    }
}
