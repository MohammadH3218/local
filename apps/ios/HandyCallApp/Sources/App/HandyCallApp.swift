import SwiftUI

@main
struct HandyCallApp: App {
    @UIApplicationDelegateAdaptor(HandyCallAppDelegate.self) private var appDelegate
    @StateObject private var container = AppContainer()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(container)
                .environmentObject(container.sessionStore)
                .task {
                    appDelegate.onDeviceToken = { token in
                        container.pushManager.didRegister(deviceToken: token)
                    }
                }
        }
    }
}
