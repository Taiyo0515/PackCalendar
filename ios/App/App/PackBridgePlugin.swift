import Capacitor
import EventKit
import UIKit
import WidgetKit

/// Bridge for things the web layer cannot do: widget data, window appearance, and calendar import.
@objc(PackBridgePlugin)
public class PackBridgePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "PackBridgePlugin"
    public let jsName = "PackBridge"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "saveWidget", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setAppearance", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "widgetStatus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "readCalendar", returnType: CAPPluginReturnPromise),
    ]

    private static let store = EKEventStore()

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

    // MARK: - Calendar import (EventKit read)

    private func parseStamp(_ s: String) -> Date? {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd'T'HH:mm"
        f.timeZone = .current
        return f.date(from: s)
    }

    private static let utcDay: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        f.timeZone = TimeZone(identifier: "UTC")
        return f
    }()

    private static let localDay: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()

    private static let localStamp: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd'T'HH:mm"
        f.timeZone = .current
        return f
    }()

    @objc func readCalendar(_ call: CAPPluginCall) {
        guard let fromStr = call.getString("from"), let toStr = call.getString("to"),
              let from = parseStamp(fromStr), let to = parseStamp(toStr) else {
            call.reject("from/to required")
            return
        }
        let store = PackBridgePlugin.store
        let grant: (Bool) -> Void = { granted in
            guard granted else {
                call.reject("カレンダーへの許可がありません")
                return
            }
            DispatchQueue.global(qos: .userInitiated).async {
                var events: [EKEvent] = []
                autoreleasepool {
                    let predicate = store.predicateForEvents(withStart: from, end: to, calendars: nil)
                    events = store.events(matching: predicate).sorted { $0.startDate < $1.startDate }
                }
                var out: [[String: Any]] = []
                var seen = Set<String>()
                for e in events {
                    if e.calendar?.type == .birthday { continue }
                    guard let title = e.title, !title.isEmpty else { continue }
                    if e.status == .canceled { continue }
                    if seen.contains(e.eventIdentifier) { continue }
                    seen.insert(e.eventIdentifier)
                    let allDay = e.isAllDay
                    let start: String, end: String?
                    if allDay {
                        start = PackBridgePlugin.utcDay.string(from: e.startDate) + "T00:00"
                        end = PackBridgePlugin.utcDay.string(from: e.endDate) + "T00:00"
                    } else {
                        start = PackBridgePlugin.localStamp.string(from: e.startDate)
                        end = PackBridgePlugin.localStamp.string(from: e.endDate)
                    }
                    var repeatRule: [String: Any]? = nil
                    if let rule = e.recurrenceRules?.first, !e.isDetached {
                        switch rule.frequency {
                        case .daily:
                            repeatRule = ["freq": "daily", "weekdays": [Int]()]
                        case .weekly:
                            let days = (rule.daysOfTheWeek ?? []).map { Int($0.dayOfTheWeek.rawValue) - 1 }
                            repeatRule = ["freq": "weekly", "weekdays": days]
                        case .monthly:
                            if rule.daysOfTheWeek == nil {
                                repeatRule = ["freq": "monthly", "weekdays": [Int]()]
                            }
                        default:
                            break
                        }
                        if var r = repeatRule {
                            if let stop = rule.recurrenceEnd?.endDate {
                                r["until"] = PackBridgePlugin.localDay.string(from: stop)
                            }
                            repeatRule = r
                        }
                    }
                    let item: [String: Any] = [
                        "uid": e.eventIdentifier,
                        "title": title,
                        "start": start,
                        "end": end ?? NSNull(),
                        "allDay": allDay,
                        "memo": e.location ?? "",
                        "repeat": repeatRule ?? NSNull(),
                    ]
                    out.append(item)
                }
                call.resolve(["events": out])
            }
        }
        if #available(iOS 17.0, *) {
            switch EKEventStore.authorizationStatus(for: .event) {
            case .notDetermined:
                store.requestFullAccessToEvents { granted, _ in grant(granted) }
            case .fullAccess:
                grant(true)
            default:
                call.reject("カレンダーへの許可がありません。設定アプリから許可してください")
            }
        } else {
            store.requestAccess(to: .event) { granted, _ in grant(granted) }
        }
    }
}
