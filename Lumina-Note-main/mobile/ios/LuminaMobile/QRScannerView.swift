import AVFoundation
import SwiftUI

final class QRScannerViewController: UIViewController, AVCaptureMetadataOutputObjectsDelegate {
    private let session = AVCaptureSession()
    private var previewLayer: AVCaptureVideoPreviewLayer?
    private let onCodeFound: (String) -> Void
    private var didFindCode = false

    init(onCodeFound: @escaping (String) -> Void) {
        self.onCodeFound = onCodeFound
        super.init(nibName: nil, bundle: nil)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black
        configureSession()
    }

    override func viewWillAppear(_ animated: Bool) {
        super.viewWillAppear(animated)
        if !session.isRunning {
            session.startRunning()
        }
    }

    override func viewWillDisappear(_ animated: Bool) {
        super.viewWillDisappear(animated)
        if session.isRunning {
            session.stopRunning()
        }
    }

    private func configureSession() {
        guard let videoDevice = AVCaptureDevice.default(for: .video),
              let videoInput = try? AVCaptureDeviceInput(device: videoDevice),
              session.canAddInput(videoInput) else {
            return
        }
        session.addInput(videoInput)

        let metadataOutput = AVCaptureMetadataOutput()
        guard session.canAddOutput(metadataOutput) else { return }
        session.addOutput(metadataOutput)
        metadataOutput.setMetadataObjectsDelegate(self, queue: DispatchQueue.main)
        metadataOutput.metadataObjectTypes = [.qr]

        let preview = AVCaptureVideoPreviewLayer(session: session)
        preview.videoGravity = .resizeAspectFill
        preview.frame = view.layer.bounds
        view.layer.addSublayer(preview)
        previewLayer = preview
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        previewLayer?.frame = view.bounds
    }

    func metadataOutput(
        _ output: AVCaptureMetadataOutput,
        didOutput metadataObjects: [AVMetadataObject],
        from connection: AVCaptureConnection
    ) {
        guard !didFindCode else { return }
        if let object = metadataObjects.first as? AVMetadataMachineReadableCodeObject,
           let value = object.stringValue {
            didFindCode = true
            session.stopRunning()
            onCodeFound(value)
        }
    }
}

struct QRScannerView: UIViewControllerRepresentable {
    let onCodeFound: (String) -> Void

    func makeUIViewController(context: Context) -> QRScannerViewController {
        QRScannerViewController(onCodeFound: onCodeFound)
    }

    func updateUIViewController(_ uiViewController: QRScannerViewController, context: Context) {}
}

struct QRScannerContainer: View {
    let onCodeFound: (String) -> Void

    var body: some View {
        ZStack {
            QRScannerView(onCodeFound: onCodeFound)
            ScanOverlay()
        }
    }
}

private struct ScanOverlay: View {
    @State private var lineOffset: CGFloat = 0

    var body: some View {
        GeometryReader { proxy in
            let side = min(proxy.size.width, proxy.size.height) * 0.6
            let originY = (proxy.size.height - side) / 2

            ZStack {
                RoundedRectangle(cornerRadius: 16)
                    .stroke(Color.green, lineWidth: 2)
                    .frame(width: side, height: side)
                    .position(x: proxy.size.width / 2, y: proxy.size.height / 2)

                Rectangle()
                    .fill(Color.green)
                    .frame(width: max(side - 12, 0), height: 2)
                    .position(x: proxy.size.width / 2, y: originY + 6 + lineOffset)
            }
            .onAppear {
                lineOffset = 0
                withAnimation(.linear(duration: 1.8).repeatForever(autoreverses: true)) {
                    lineOffset = max(side - 12, 0)
                }
            }
        }
        .allowsHitTesting(false)
    }
}
