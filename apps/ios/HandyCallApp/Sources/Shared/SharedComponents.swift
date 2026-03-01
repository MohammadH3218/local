import SwiftUI

// MARK: - String Extension

extension String {
    var nonEmpty: String? {
        let trimmed = trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }
}

// MARK: - HCKeyValueRow

struct HCKeyValueRow: View {
    let title: String
    let value: String
    var icon: String? = nil
    var valueColor: Color = .primary

    var body: some View {
        HStack(spacing: 10) {
            if let icon {
                Image(systemName: icon)
                    .font(.footnote)
                    .foregroundStyle(HandyCallTheme.emerald)
                    .frame(width: 20)
            }
            Text(title)
                .foregroundStyle(.secondary)
            Spacer()
            Text(value)
                .foregroundStyle(valueColor)
                .multilineTextAlignment(.trailing)
        }
    }
}

// MARK: - AvatarView

struct AvatarView: View {
    let name: String
    var size: CGFloat = 44

    private var initials: String {
        let parts = name.split(separator: " ").prefix(2)
        let result = parts.map { String($0.prefix(1)).uppercased() }.joined()
        return result.isEmpty ? "?" : result
    }

    private var backgroundGradient: LinearGradient {
        let hash = abs(name.hashValue)
        let hueShift = Double(hash % 30) - 15
        let baseHue = 0.42 + (hueShift / 360.0)
        return LinearGradient(
            colors: [
                Color(hue: baseHue, saturation: 0.55, brightness: 0.65),
                Color(hue: baseHue, saturation: 0.65, brightness: 0.50)
            ],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
    }

    var body: some View {
        Text(initials)
            .font(.system(size: size * 0.38, weight: .bold, design: .rounded))
            .foregroundStyle(.white)
            .frame(width: size, height: size)
            .background(backgroundGradient, in: Circle())
    }
}

// MARK: - StatusBadge

struct StatusBadge: View {
    let text: String
    var style: BadgeStyle = .automatic

    enum BadgeStyle {
        case automatic
        case custom(color: Color)
    }

    private var color: Color {
        switch style {
        case .automatic:
            return HandyCallTheme.statusColor(for: text)
        case .custom(let c):
            return c
        }
    }

    var body: some View {
        Text(text.replacingOccurrences(of: "_", with: " ").capitalized)
            .font(.caption.weight(.semibold))
            .padding(.horizontal, 10)
            .padding(.vertical, 4)
            .foregroundStyle(color)
            .background(color.opacity(0.12), in: Capsule())
    }
}

// MARK: - SectionCard

struct SectionCard<Content: View>: View {
    let title: String
    var icon: String? = nil
    @ViewBuilder var content: () -> Content

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 6) {
                if let icon {
                    Image(systemName: icon)
                        .font(.subheadline)
                        .foregroundStyle(HandyCallTheme.emerald)
                }
                Text(title)
                    .font(HandyCallTheme.Typography.headline)
                    .foregroundStyle(.secondary)
            }

            VStack(alignment: .leading, spacing: 0) {
                content()
            }
            .padding(HandyCallTheme.Spacing.cardPadding)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(
                HandyCallTheme.surfaceWhite,
                in: RoundedRectangle(cornerRadius: HandyCallTheme.Radius.card, style: .continuous)
            )
            .cardShadow()
        }
    }
}

// MARK: - ShimmerView

struct ShimmerView: View {
    var width: CGFloat? = nil
    var height: CGFloat = 16
    var cornerRadius: CGFloat = 8

    @State private var phase: CGFloat = 0

    var body: some View {
        RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
            .fill(
                LinearGradient(
                    colors: [
                        Color.gray.opacity(0.12),
                        Color.gray.opacity(0.22),
                        Color.gray.opacity(0.12)
                    ],
                    startPoint: .init(x: phase - 0.5, y: 0.5),
                    endPoint: .init(x: phase + 0.5, y: 0.5)
                )
            )
            .frame(width: width, height: height)
            .onAppear {
                withAnimation(.linear(duration: 1.2).repeatForever(autoreverses: false)) {
                    phase = 1.5
                }
            }
    }
}

struct ListRowSkeleton: View {
    var body: some View {
        HStack(spacing: 12) {
            ShimmerView(width: 44, height: 44, cornerRadius: 22)
            VStack(alignment: .leading, spacing: 8) {
                ShimmerView(width: 140, height: 14)
                ShimmerView(width: 100, height: 12)
            }
            Spacer()
        }
        .padding(.vertical, 8)
    }
}

struct StatCardSkeleton: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            ShimmerView(width: 34, height: 34, cornerRadius: 10)
            ShimmerView(width: 50, height: 28, cornerRadius: 6)
            ShimmerView(width: 80, height: 12)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(HandyCallTheme.Spacing.cardPadding)
        .background(
            HandyCallTheme.surfaceWhite,
            in: RoundedRectangle(cornerRadius: HandyCallTheme.Radius.card, style: .continuous)
        )
    }
}

struct DashboardSkeleton: View {
    var body: some View {
        LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
            ForEach(0..<4, id: \.self) { _ in
                StatCardSkeleton()
            }
        }
    }
}

// MARK: - HCEmptyState

struct HCEmptyState: View {
    let icon: String
    let title: String
    let message: String

    var body: some View {
        VStack(spacing: 16) {
            Image(systemName: icon)
                .font(.system(size: 44))
                .foregroundStyle(HandyCallTheme.emerald.opacity(0.5))
            Text(title)
                .font(HandyCallTheme.Typography.headline)
                .foregroundStyle(HandyCallTheme.slate)
            Text(message)
                .font(HandyCallTheme.Typography.footnote)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
        .padding(HandyCallTheme.Spacing.xxxl)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

// MARK: - HCErrorCard

struct HCErrorCard: View {
    let text: String

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: "exclamationmark.triangle.fill")
                .foregroundStyle(HandyCallTheme.destructive)
            Text(text)
                .font(.footnote)
                .foregroundStyle(HandyCallTheme.destructive)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(
            HandyCallTheme.destructive.opacity(0.08),
            in: RoundedRectangle(cornerRadius: HandyCallTheme.Radius.md, style: .continuous)
        )
    }
}

// MARK: - StaggeredAppearance

struct StaggeredAppearance: ViewModifier {
    let index: Int
    @State private var isVisible = false

    func body(content: Content) -> some View {
        content
            .opacity(isVisible ? 1 : 0)
            .offset(y: isVisible ? 0 : 12)
            .animation(
                .spring(response: 0.4, dampingFraction: 0.8)
                    .delay(Double(index) * 0.05),
                value: isVisible
            )
            .onAppear { isVisible = true }
    }
}

extension View {
    func staggeredAppearance(index: Int) -> some View {
        modifier(StaggeredAppearance(index: index))
    }
}
