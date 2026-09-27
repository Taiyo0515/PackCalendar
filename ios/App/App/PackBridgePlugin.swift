import Capacitor
import UIKit
import WidgetKit

/// Bridge for things the web layer cannot do: widget data and window appearance.
@objc(PackBridgePlugin)
public class PackBridgePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "PackBridgePlugin"
    public let jsName = "PackBridge"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "saveWidget", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setAppearance", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "widgetStatus", returnType: CAPPluginReturnPromise),
    ]

    @objc func saveWidget(_ call: CAPPluginCall) {
        guard let json = call.getString("json"), let data = json.data(using: .utf8) else {
            call.reject("json is required")
            return
        }
        let written = SharedGroup.write(data)
        WidgetCenter.shared.reloadAllTimelines()
        if written.isEmpty {
            call.reject("App Group に書き込めません: " + SharedGroup.candidates().joined(separator: ", "))
        } else {
            call.resolve(["groups": written])
        }
    }

    @objc func widgetStatus(_ call: CAPPluginCall) {
        let probe = SharedGroup.read() != nil
        call.resolve(["candidates": SharedGroup.candidates(), "readable": probe])
    }

    @objc func setAppearance(_ call: CAPPluginCall) {
        let mode = call.getString("mode") ?? "system"
        DispatchQueue.main.async {
            let style: UIUserInterfaceStyle = mode == "dark" ? .dark : mode == "light" ? .light : .unspecified
            self.bridge?.viewController?.view.window?.overrideUserInterfaceStyle = style
            call.resolve()
        }
    }
}
