import { pdfjs } from "react-pdf";

// 使用本地打包的 pdf.worker 文件，而不是从 unpkg 加载
// 这里的 ?url 由 Vite 处理成最终的静态资源 URL
import workerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjs.GlobalWorkerOptions.workerSrc = workerSrc as any;
