import SwiftUI

struct RootView: View {
    @EnvironmentObject private var container: AppContainer
    @EnvironmentObject private var sessionStore: SessionStore
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        Group {
            if sessionStore.isAuthenticated {
                MainTabView()
                    .transition(.opacity.combined(with: .scale(scale: 0.98)))
                    .task {
                        await sessionStore.refreshCompany()
                        await container.pushManager.requestAuthorizationIfNeeded()
                    }
            } else {
                LoginView()
                    .transition(.opacity)
            }
        }
        .animation(.spring(response: 0.35, dampingFraction: 0.85), value: sessionStore.isAuthenticated)
        .background(HandyCallTheme.canvas.ignoresSafeArea())
        .onChange(of: scenePhase) { _, newPhase in
            if newPhase == .active {
                Task { await sessionStore.validateAndRefreshIfNeeded() }
            }
        }
    }
}
