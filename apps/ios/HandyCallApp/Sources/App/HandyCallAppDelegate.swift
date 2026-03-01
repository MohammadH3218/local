import Foundation
import UIKit

final class HandyCallAppDelegate: NSObject, UIApplicationDelegate {
    var onDeviceToken: ((Data) -> Void)?

    func application(
        _ application: UIApplication,
        didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
    ) {
        onDeviceToken?(deviceToken)
    }

    func application(
        _ application: UIApplication,
        didFailToRegisterForRemoteNotificationsWithError error: Error
    ) {
        // Ignore registration failures; app remains fully functional without push.
    }
}
