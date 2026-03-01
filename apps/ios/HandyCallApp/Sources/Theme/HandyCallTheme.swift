import SwiftUI

enum HandyCallTheme {
    // MARK: - Core Colors (existing)
    static let emerald = Color(red: 0.05, green: 0.63, blue: 0.44)
    static let emeraldDark = Color(red: 0.02, green: 0.49, blue: 0.34)
    static let slate = Color(red: 0.09, green: 0.14, blue: 0.20)
    static let canvas = Color(red: 0.96, green: 0.98, blue: 0.97)

    // MARK: - Extended Colors
    static let emeraldLight = Color(red: 0.85, green: 0.95, blue: 0.90)
    static let emeraldMist = Color(red: 0.92, green: 0.97, blue: 0.94)
    static let callerBubble = Color(red: 0.93, green: 0.95, blue: 0.98)
    static let surfaceWhite = Color.white
    static let surfaceGray = Color(red: 0.95, green: 0.95, blue: 0.95)
    static let pageBackground = Color(red: 0.95, green: 0.98, blue: 0.96)
    static let destructive = Color(red: 0.90, green: 0.25, blue: 0.20)
    static let warning = Color(red: 0.95, green: 0.68, blue: 0.14)
    static let info = Color(red: 0.20, green: 0.50, blue: 0.90)

    // MARK: - Semantic Aliases
    static let textPrimary = slate
    static let textSecondary = Color.secondary

    // MARK: - Gradients
    static let topGradient = LinearGradient(
        colors: [emeraldDark, emerald],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
    )

    static let heroGradient = LinearGradient(
        colors: [emeraldDark, emerald, emerald.opacity(0.9)],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
    )

    static let cardGradient = LinearGradient(
        colors: [emerald.opacity(0.08), emeraldDark.opacity(0.03)],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
    )

    // MARK: - Status Color Mapping
    static func statusColor(for status: String?) -> Color {
        switch status?.lowercased().replacingOccurrences(of: "_", with: " ") {
        case "completed", "confirmed", "qualified":
            return emerald
        case "in progress", "active", "new":
            return info
        case "scheduled", "pending", "contacted":
            return warning
        case "cancelled", "missed", "lost":
            return destructive
        default:
            return .secondary
        }
    }

    // MARK: - Typography
    enum Typography {
        static let largeTitle = Font.largeTitle.weight(.bold)
        static let title = Font.title2.weight(.bold)
        static let title3 = Font.title3.weight(.bold)
        static let headline = Font.headline.weight(.semibold)
        static let subhead = Font.subheadline.weight(.medium)
        static let body = Font.body
        static let callout = Font.callout.weight(.semibold)
        static let footnote = Font.footnote
        static let footnoteSemibold = Font.footnote.weight(.semibold)
        static let caption = Font.caption
        static let caption2 = Font.caption2.weight(.semibold)
        static let statNumber = Font.system(size: 28, weight: .bold, design: .rounded)
    }

    // MARK: - Spacing
    enum Spacing {
        static let xs: CGFloat = 4
        static let sm: CGFloat = 8
        static let md: CGFloat = 12
        static let lg: CGFloat = 16
        static let xl: CGFloat = 20
        static let xxl: CGFloat = 24
        static let xxxl: CGFloat = 32
        static let cardPadding: CGFloat = 16
        static let screenPadding: CGFloat = 16
    }

    // MARK: - Corner Radius
    enum Radius {
        static let sm: CGFloat = 8
        static let md: CGFloat = 12
        static let lg: CGFloat = 16
        static let xl: CGFloat = 20
        static let card: CGFloat = 16
        static let button: CGFloat = 14
    }
}

// MARK: - Shadow Modifiers

struct CardShadow: ViewModifier {
    func body(content: Content) -> some View {
        content.shadow(color: .black.opacity(0.06), radius: 8, x: 0, y: 3)
    }
}

struct ElevatedShadow: ViewModifier {
    func body(content: Content) -> some View {
        content.shadow(color: .black.opacity(0.12), radius: 16, x: 0, y: 6)
    }
}

struct SubtleShadow: ViewModifier {
    func body(content: Content) -> some View {
        content.shadow(color: .black.opacity(0.04), radius: 4, x: 0, y: 2)
    }
}

extension View {
    func cardShadow() -> some View { modifier(CardShadow()) }
    func elevatedShadow() -> some View { modifier(ElevatedShadow()) }
    func subtleShadow() -> some View { modifier(SubtleShadow()) }
}
