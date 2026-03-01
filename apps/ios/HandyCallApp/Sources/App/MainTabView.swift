import SwiftUI

@MainActor
final class TabBadgeStore: ObservableObject {
    @Published var unreadNotifications: Int = 0

    func refresh(using api: APIClient) async {
        do {
            unreadNotifications = try await api.getUnreadNotificationCount()
        } catch {
            // Silently ignore badge fetch errors
        }
    }
}

struct MainTabView: View {
    @EnvironmentObject private var container: AppContainer
    @StateObject private var badgeStore = TabBadgeStore()

    var body: some View {
        TabView {
            DashboardView()
                .tabItem {
                    Label("Home", systemImage: "house.fill")
                }

            CallsView()
                .tabItem {
                    Label("Calls", systemImage: "phone.fill")
                }

            MessagesView()
                .tabItem {
                    Label("Messages", systemImage: "message.fill")
                }

            ContactsView()
                .tabItem {
                    Label("Contacts", systemImage: "person.2.fill")
                }

            AppointmentsView()
                .tabItem {
                    Label("Bookings", systemImage: "calendar.badge.checkmark")
                }

            SettingsView()
                .tabItem {
                    Label("Settings", systemImage: "gearshape.fill")
                }
                .badge(badgeStore.unreadNotifications > 0 ? badgeStore.unreadNotifications : 0)
        }
        .tint(HandyCallTheme.emeraldDark)
        .task {
            await badgeStore.refresh(using: container.apiClient)
        }
    }
}
