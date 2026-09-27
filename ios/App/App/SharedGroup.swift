import Foundation

/// Finds the App Group shared by the app and the widget.
/// SideStore/AltStore rewrite group IDs when re-signing, so the ID is resolved at run time:
/// 1. ALTAppGroups in Info.plist, 2. the embedded provisioning profile, 3. the build-time ID.
enum SharedGroup {
    static let buildID = "group.io.github.taiyo0515.packcalendar"

    static func candidates() -> [String] {
        var ids: [String] = []
        if let alt = Bundle.main.object(forInfoDictionaryKey: "ALTAppGroups") as? [String] { ids += alt }
        if let alt = Bundle.main.object(forInfoDictionaryKey: "ALTAppGroups") as? [String: Any] {
            ids += alt.values.compactMap { $0 as? String }
        }
        ids += fromProvisioningProfile()
        ids.append(buildID)
        return ids
    }

    static func fromProvisioningProfile() -> [String] {
        guard let url = Bundle.main.url(forResource: "embedded", withExtension: "mobileprovision"),
              let data = try? Data(contentsOf: url),
              let text = String(data: data, encoding: .isoLatin1),
              let start = text.range(of: "<?xml"),
              let end = text.range(of: "</plist>") else { return [] }
        let xml = Data(text[start.lowerBound..<end.upperBound].utf8)
        guard let plist = try? PropertyListSerialization.propertyList(from: xml, format: nil) as? [String: Any],
              let entitlements = plist["Entitlements"] as? [String: Any],
              let groups = entitlements["com.apple.security.application-groups"] as? [String] else { return [] }
        return groups
    }

    static func container() -> URL? {
        for id in candidates() where id.lowercased().contains("packcalendar") {
            if let url = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: id) { return url }
        }
        return nil
    }

    static func fileURL() -> URL? { container()?.appendingPathComponent("widget.json") }
}
