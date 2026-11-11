import SwiftUI
import WebKit

/* LearnOS 原生壳：WKWebView 全屏加载平台（带进度条与深色背景）。
   如需指向自托管服务，把 URL 换成 https://你的域名 即可。 */
struct WebView: UIViewRepresentable {
    let url: URL

    func makeUIView(context: Context) -> WKWebView {
        let cfg = WKWebViewConfiguration()
        cfg.allowsInlineMediaPlayback = true
        let wv = WKWebView(frame: .zero, configuration: cfg)
        wv.scrollView.contentInsetAdjustmentBehavior = .never
        wv.isOpaque = false
        wv.backgroundColor = UIColor(red: 7 / 255, green: 11 / 255, blue: 20 / 255, alpha: 1)
        wv.load(URLRequest(url: url))
        return wv
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}
}

struct ContentView: View {
    private let url = URL(string: "https://lucasbeckhan.github.io/cdmp-study-platform/")!

    var body: some View {
        ZStack {
            Color(red: 7 / 255, green: 11 / 255, blue: 20 / 255).ignoresSafeArea()
            WebView(url: url)
                .ignoresSafeArea(edges: .bottom)
        }
    }
}

#Preview {
    ContentView()
}
