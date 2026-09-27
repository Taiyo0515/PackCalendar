import Foundation

/// Shared storage between the app and the widget.
///
/// SideStore/AltStore rewrite App Group IDs when re-signing (a team ID is appended), and it is
/// not guaranteed which bundle (app or extension) carries which hint. So every plausible ID is
/// collected, the app writes to every container it can actually write to, and the widget reads
/// the newest file it can find.
enum SharedGroup {
    static let buildID = "group.io.github.taiyo0515.packcalendar"
    static let fileName = "widget.json"

    /// The extension's own bundle plus the containing app (PlugIns/X.appex -> X.app).
    private static func bundles() -> [Bundle] {
        var list = [Bundle.main]
        let url = Bundle.main.bundleURL
        if url.pathExtension == "appex",
           let app = Bundle(url: url.deletingLastPathComponent().deletingLastPathComponent()) {
            list.append(app)
        }
        return list
    }

    private static func profileGroups(_ bundle: Bundle) -> [String] {
        guard let url = bundle.url(forResource: "embedded", withExtension: "mobileprovision"),
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

    static func candidates() -> [String] {
        var ids: [String] = []
        for bundle in bundles() {
            let alt = bundle.object(forInfoDictionaryKey: "ALTAppGroups")
            if let list = alt as? [String] { ids += list }
            if let map = alt as? [String: Any] {
                ids += map.values.compactMap { $0 as? String }
                ids += map.keys
            }
            ids += profileGroups(bundle)
            if let id = bundle.bundleIdentifier, bundle.bundleURL.pathExtension == "app" { ids.append("group.\(id)") }
        }
        if let id = Bundle.main.bundleIdentifier, id.hasSuffix(".widget") { ids.append("group.\(id.dropLast(7))") }
        ids.append(buildID)
        var seen = Set<String>()
        return ids.filter { $0.hasPrefix("group.") && seen.insert($0).inserted }
    }

    private static func containers() -> [(String, URL)] {
        candidates().compactMap { id in
            FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: id).map { (id, $0) }
        }
    }

    /// Writes the data to every container that accepts it. Returns the group IDs written.
    @discardableResult
    static func write(_ data: Data) -> [String] {
        var written: [String] = []
        for (id, url) in containers() {
            do {
                try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
                try data.write(to: url.appendingPathComponent(fileName), options: .atomic)
                written.append(id)
            } catch {
                continue
            }
        }
        return written
    }

    /// The most recently written data among all readable containers.
    static func read() -> Data? {
        var best: (Date, Data)?
        for (_, url) in containers() {
            let file = url.appendingPathComponent(fileName)
            guard let data = try? Data(contentsOf: file) else { continue }
            let date = (try? file.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate) ?? .distantPast
            if best == nil || date > best!.0 { best = (date, data) }
        }
        return best?.1
    }
}
