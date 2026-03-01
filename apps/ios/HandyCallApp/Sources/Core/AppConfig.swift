import Foundation

enum APNSEnvironment: String {
    case sandbox
    case production
}

enum AppConfig {
    // Update for your environment.
    static let apiBaseURL = URL(string: "https://api.handycall.org/api/v1")!
    static let apnsEnvironment: APNSEnvironment = .production

    static let cognitoAuthBaseURL = URL(string: "https://handycall.auth.us-east-1.amazoncognito.com")!
    static let cognitoClientID = "3vhh0artoakoardoi4e9rdm3m9"
    static let oauthRedirectScheme = "handycall"
    static let oauthRedirectURI = "handycall://auth/callback"
}
