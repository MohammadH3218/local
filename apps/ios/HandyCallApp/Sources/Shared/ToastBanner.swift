import SwiftUI

struct ToastBanner: View {
    let text: String
    var style: ToastStyle = .success

    enum ToastStyle {
        case success, error, info

        var icon: String {
            switch self {
            case .success: return "checkmark.circle.fill"
            case .error: return "xmark.circle.fill"
            case .info: return "info.circle.fill"
            }
        }

        var iconColor: Color {
            switch self {
            case .success: return HandyCallTheme.emerald
            case .error: return HandyCallTheme.destructive
            case .info: return HandyCallTheme.info
            }
        }
    }

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: style.icon)
                .foregroundStyle(style.iconColor)
            Text(text)
                .font(.footnote.weight(.semibold))
                .foregroundStyle(.white)
            Spacer()
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .background(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(HandyCallTheme.slate.opacity(0.92))
        )
        .shadow(color: .black.opacity(0.18), radius: 14, y: 6)
        .padding(.horizontal, 16)
    }
}
