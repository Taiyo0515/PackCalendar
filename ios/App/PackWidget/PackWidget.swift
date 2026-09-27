import SwiftUI
import WidgetKit

// MARK: - Data written by the app (src/core/schedule.ts widgetData)

struct Snapshot: Decodable {
    struct Line: Decodable {
        let label: String
        let names: String
    }
    struct Unit: Decodable {
        let start: String
        let title: String
        let bag: String
        let color: String
        let lines: [Line]
    }
    struct Bar: Decodable {
        let t: String
        let c: String
    }
    let v: Int
    let theme: String
    let weekStart: Int
    let units: [Unit]
    let days: [String: [Bar]]
    let holidays: [String: String]

    static func load() -> Snapshot? {
        guard let data = SharedGroup.read() else { return nil }
        return try? JSONDecoder().decode(Snapshot.self, from: data)
    }
}

// MARK: - Local wall-clock helpers

enum Wall {
    static let calendar: Calendar = {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = .current
        return c
    }()
    private static let minuteFormat: DateFormatter = formatter("yyyy-MM-dd'T'HH:mm")
    private static let dayFormat: DateFormatter = formatter("yyyy-MM-dd")
    private static func formatter(_ format: String) -> DateFormatter {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = .current
        f.dateFormat = format
        return f
    }
    static func date(_ s: String) -> Date? { minuteFormat.date(from: s) }
    static func key(_ d: Date) -> String { dayFormat.string(from: d) }
    static let weekdays = ["日", "月", "火", "水", "木", "金", "土"]

    static func when(_ start: String, now: Date) -> String {
        guard let d = date(start) else { return "" }
        let days = calendar.dateComponents([.day], from: calendar.startOfDay(for: now), to: calendar.startOfDay(for: d)).day ?? 0
        let c = calendar.dateComponents([.month, .day, .weekday, .hour, .minute], from: d)
        let day = days == 0 ? "今日" : days == 1 ? "明日" : "\(c.month!)/\(c.day!)(\(weekdays[c.weekday! - 1]))"
        return start.hasSuffix("T00:00") ? day : "\(day) \(c.hour!):" + String(format: "%02d", c.minute!)
    }
}

// MARK: - Timeline

struct Entry: TimelineEntry {
    let date: Date
    let snapshot: Snapshot?
}

struct Provider: TimelineProvider {
    func placeholder(in context: Context) -> Entry { Entry(date: Date(), snapshot: nil) }

    func getSnapshot(in context: Context, completion: @escaping (Entry) -> Void) {
        completion(Entry(date: Date(), snapshot: Snapshot.load()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<Entry>) -> Void) {
        let snapshot = Snapshot.load()
        let now = Date()
        var dates: Set<Date> = [now]
        for unit in snapshot?.units.prefix(20) ?? [] {
            if let d = Wall.date(unit.start), d > now { dates.insert(d) }
        }
        if let midnight = Wall.calendar.nextDate(after: now, matching: DateComponents(hour: 0, minute: 0), matchingPolicy: .nextTime) {
            dates.insert(midnight)
        }
        let entries = dates.sorted().map { Entry(date: $0, snapshot: snapshot) }
        completion(Timeline(entries: entries, policy: .atEnd))
    }
}

// MARK: - Colors

extension Color {
    init(hex: String) {
        var value: UInt64 = 0
        Scanner(string: hex.replacingOccurrences(of: "#", with: "")).scanHexInt64(&value)
        self.init(
            red: Double((value >> 16) & 0xFF) / 255,
            green: Double((value >> 8) & 0xFF) / 255,
            blue: Double(value & 0xFF) / 255
        )
    }
}

struct Palette {
    let dark: Bool
    init(theme: String?, scheme: ColorScheme) {
        dark = theme == "dark" || (theme != "light" && scheme == .dark)
    }
    var bg: Color { dark ? Color(hex: "#111111") : Color(hex: "#FFFFFF") }
    var text: Color { dark ? Color(hex: "#F2F2F2") : Color(hex: "#111111") }
    var sub: Color { Color(hex: "#8E8E93") }
    var faint: Color { dark ? Color(hex: "#48484A") : Color(hex: "#C7C7CC") }
    var line: Color { dark ? Color(hex: "#2A2A2C") : Color(hex: "#E3E3E8") }
    var red: Color { dark ? Color(hex: "#FF6369") : Color(hex: "#E5484D") }
    var blue: Color { dark ? Color(hex: "#5B8DEF") : Color(hex: "#2F6FDF") }
    var accent: Color { dark ? Color(hex: "#2FBF83") : Color(hex: "#1E9E6A") }
    var holiday: Color { dark ? Color(hex: "#C9363C") : Color(hex: "#D93A40") }
}

// MARK: - Preparation (2x2)

struct PrepView: View {
    let entry: Entry
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        let p = Palette(theme: entry.snapshot?.theme, scheme: scheme)
        content(p)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .containerBackground(p.bg, for: .widget)
    }

    private func next(_ s: Snapshot) -> Snapshot.Unit? {
        let limit = entry.date.addingTimeInterval(48 * 3600)
        return s.units.first { unit in
            guard let d = Wall.date(unit.start) else { return false }
            return d > entry.date && d <= limit
        }
    }

    private func lines(_ unit: Snapshot.Unit) -> [Snapshot.Line] {
        if unit.lines.count <= 2 { return unit.lines }
        let rest = unit.lines.dropFirst().reduce(0) { $0 + $1.names.components(separatedBy: "・").count }
        return [unit.lines[0], Snapshot.Line(label: "ほか", names: "\(rest)点")]
    }

    @ViewBuilder
    private func content(_ p: Palette) -> some View {
        if let snapshot = entry.snapshot {
            if let unit = next(snapshot) {
                VStack(alignment: .leading, spacing: 1) {
                    Text(Wall.when(unit.start, now: entry.date))
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(p.sub)
                    Text(unit.bag)
                        .font(.system(size: 17, weight: .bold))
                        .foregroundColor(Color(hex: unit.color))
                        .lineLimit(1)
                    if unit.lines.isEmpty {
                        Spacer(minLength: 0)
                        Label("準備OK", systemImage: "checkmark")
                            .font(.system(size: 15, weight: .semibold))
                            .foregroundColor(p.accent)
                        Spacer(minLength: 0)
                    } else {
                        ForEach(Array(lines(unit).enumerated()), id: \.offset) { _, line in
                            Text(line.label)
                                .font(.system(size: 11))
                                .foregroundColor(p.sub)
                                .lineLimit(1)
                                .padding(.top, 4)
                            Text(line.names)
                                .font(.system(size: 14, weight: .semibold))
                                .foregroundColor(p.text)
                                .lineLimit(1)
                        }
                    }
                }
            } else {
                Text("予定なし")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(p.sub)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        } else {
            Text("アプリを開いてください")
                .font(.system(size: 13))
                .foregroundColor(p.sub)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }
}

// MARK: - Calendar (4x4)

struct CalendarView: View {
    let entry: Entry
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        let p = Palette(theme: entry.snapshot?.theme, scheme: scheme)
        let weekStart = entry.snapshot?.weekStart ?? 0
        let cal = Wall.calendar
        let month = cal.component(.month, from: entry.date)
        let days = grid(weekStart: weekStart)
        VStack(spacing: 0) {
            HStack {
                Text("\(month)月").font(.system(size: 16, weight: .bold)).foregroundColor(p.text)
                Spacer()
            }
            .padding(.bottom, 4)
            HStack(spacing: 0) {
                ForEach(0..<7, id: \.self) { i in
                    let wd = (i + weekStart) % 7
                    Text(Wall.weekdays[wd])
                        .font(.system(size: 9, weight: .medium))
                        .foregroundColor(wd == 0 ? p.red : wd == 6 ? p.blue : p.sub)
                        .frame(maxWidth: .infinity)
                }
            }
            .padding(.bottom, 2)
            ForEach(0..<6, id: \.self) { w in
                Rectangle().fill(p.line).frame(height: 0.5)
                HStack(spacing: 1) {
                    ForEach(0..<7, id: \.self) { d in
                        cell(days[w * 7 + d], month: month, palette: p)
                    }
                }
                .frame(maxHeight: .infinity)
            }
        }
        .containerBackground(p.bg, for: .widget)
    }

    private func grid(weekStart: Int) -> [Date] {
        let cal = Wall.calendar
        let first = cal.date(from: cal.dateComponents([.year, .month], from: entry.date))!
        let offset = (cal.component(.weekday, from: first) - 1 - weekStart + 7) % 7
        let start = cal.date(byAdding: .day, value: -offset, to: first)!
        return (0..<42).map { cal.date(byAdding: .day, value: $0, to: start)! }
    }

    private func bars(_ key: String, palette p: Palette) -> [(String, Color)] {
        var result: [(String, Color)] = []
        if let holiday = entry.snapshot?.holidays[key] { result.append((holiday, p.holiday)) }
        for bar in entry.snapshot?.days[key] ?? [] { result.append((bar.t, Color(hex: bar.c))) }
        return result
    }

    private func cell(_ date: Date, month: Int, palette p: Palette) -> some View {
        let cal = Wall.calendar
        let key = Wall.key(date)
        let all = bars(key, palette: p)
        let isHoliday = entry.snapshot?.holidays[key] != nil
        let other = cal.component(.month, from: date) != month
        let today = cal.isDate(date, inSameDayAs: entry.date)
        let wd = cal.component(.weekday, from: date) - 1
        let numberColor: Color = today ? .white : other ? p.faint : (isHoliday || wd == 0) ? p.red : wd == 6 ? p.blue : p.text
        let shown = all.count > 2 ? [all[0]] : all
        return VStack(spacing: 1) {
            Text("\(cal.component(.day, from: date))")
                .font(.system(size: 10, weight: today ? .bold : .medium))
                .foregroundColor(numberColor)
                .frame(width: 16, height: 16)
                .background(Circle().fill(today ? p.red : Color.clear))
            ForEach(Array(shown.enumerated()), id: \.offset) { _, bar in
                Text(bar.0)
                    .font(.system(size: 8, weight: .bold))
                    .foregroundColor(.white)
                    .lineLimit(1)
                    .fixedSize(horizontal: true, vertical: false)
                    .padding(.leading, 2)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .frame(height: 12)
                    .background(bar.1)
                    .clipShape(RoundedRectangle(cornerRadius: 2))
                    .opacity(other ? 0.5 : 1)
            }
            if all.count > 2 {
                Text("+\(all.count - 1)")
                    .font(.system(size: 8, weight: .semibold))
                    .foregroundColor(p.sub)
                    .frame(height: 12)
            }
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .padding(.top, 2)
    }
}

// MARK: - Widgets

struct PrepWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "PrepWidget", provider: Provider()) { entry in
            PrepView(entry: entry)
        }
        .configurationDisplayName("準備")
        .description("次の準備で移す持ち物")
        .supportedFamilies([.systemSmall])
    }
}

struct CalendarWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "CalendarWidget", provider: Provider()) { entry in
            CalendarView(entry: entry)
        }
        .configurationDisplayName("カレンダー")
        .description("今月の予定")
        .supportedFamilies([.systemLarge])
    }
}

@main
struct PackWidgets: WidgetBundle {
    var body: some Widget {
        PrepWidget()
        CalendarWidget()
    }
}
