import { parseMarkdown } from "@/services/markdown/markdown";
import { save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { getCurrentLocale, getCurrentTranslations } from "@/stores/useLocaleStore";

/**
 * 导出当前笔记为 PDF
 * 使用 jspdf + html2canvas 生成 PDF 文件
 */
export async function exportToPdf(content: string, title: string) {
  const t = getCurrentTranslations();
  const locale = getCurrentLocale();

  // 弹出保存对话框
  const filePath = await save({
    defaultPath: `${title}.pdf`,
    filters: [{ name: t.pdf.fileFilterName, extensions: ['pdf'] }],
  });
  
  if (!filePath) return; // 用户取消
  
  // 解析 Markdown 为 HTML
  const html = parseMarkdown(content);
  
  // 创建临时容器渲染内容
  const container = document.createElement('div');
  container.id = 'pdf-export-container';
  container.style.cssText = `
    position: fixed;
    left: -9999px;
    top: 0;
    width: 794px;
    background: white;
    padding: 40px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 14px;
    line-height: 1.8;
    color: #333;
  `;
  
  container.innerHTML = `
      <div style="text-align:center;margin-bottom:30px;padding-bottom:20px;border-bottom:2px solid #eee;">
      <div style="color:#3b82f6;font-size:14px;font-weight:600;letter-spacing:1px;margin-bottom:8px;">Lumina Note</div>
      <h1 style="font-size:24px;margin:0;color:#333;">${title}</h1>
      <div style="color:#888;font-size:12px;margin-top:8px;">${t.pdf.exportedAt}：${new Date().toLocaleString(locale)}</div>
    </div>
    <div class="content">${html}</div>
  `;
  
  // 添加内容样式
  const style = document.createElement('style');
  style.textContent = `
    #pdf-export-container h1, #pdf-export-container h2, #pdf-export-container h3 { margin-top: 1em; margin-bottom: 0.5em; }
    #pdf-export-container h1 { font-size: 1.8em; border-bottom: 2px solid #eee; padding-bottom: 0.3em; }
    #pdf-export-container h2 { font-size: 1.4em; border-bottom: 1px solid #eee; padding-bottom: 0.3em; }
    #pdf-export-container h3 { font-size: 1.2em; }
    #pdf-export-container p { margin: 0.8em 0; }
    #pdf-export-container code { background: #f5f5f5; padding: 2px 6px; border-radius: 4px; font-family: monospace; }
    #pdf-export-container pre { background: #f8f8f8; padding: 12px; border-radius: 6px; overflow-x: auto; margin: 1em 0; }
    #pdf-export-container pre code { background: transparent; padding: 0; }
    #pdf-export-container blockquote { border-left: 4px solid #ddd; padding-left: 16px; margin: 1em 0; color: #666; }
    #pdf-export-container ul, #pdf-export-container ol { margin: 0.8em 0; padding-left: 2em; }
    #pdf-export-container table { border-collapse: collapse; width: 100%; margin: 1em 0; }
    #pdf-export-container th, #pdf-export-container td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    #pdf-export-container th { background: #f5f5f5; }
    #pdf-export-container img { max-width: 100%; }
    #pdf-export-container .wikilink { color: #0066cc; }
    #pdf-export-container .tag { color: #6b7280; background: #f3f4f6; padding: 2px 8px; border-radius: 12px; }
    #pdf-export-container .callout { padding: 12px; margin: 1em 0; border-radius: 8px; border-left: 4px solid #3b82f6; background: #e8f4fd; }
  `;
  document.head.appendChild(style);
  document.body.appendChild(container);
  
  try {
    // 等待内容渲染
    await new Promise(resolve => setTimeout(resolve, 300));
    
    // 使用 html2canvas 渲染为图片
    const canvas = await html2canvas(container, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
    });
    
    // 创建 PDF
    const imgWidth = 210; // A4 宽度 mm
    const pageHeight = 297; // A4 高度 mm
    const imgHeight = (canvas.height * imgWidth) / canvas.width;
    
    const pdf = new jsPDF('p', 'mm', 'a4');
    let heightLeft = imgHeight;
    let position = 0;
    
    // 添加图片到 PDF（支持多页）
    pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;
    
    while (heightLeft > 0) {
      position = heightLeft - imgHeight;
      pdf.addPage();
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
    }
    
    // 获取 PDF 数据并保存
    const pdfData = pdf.output('arraybuffer');
    await writeFile(filePath, new Uint8Array(pdfData));
    
    alert(t.pdf.exportSuccess);
  } catch (err) {
    console.error('PDF 导出失败:', err);
    alert(`${t.pdf.exportFailed}: ${(err as Error).message}`);
  } finally {
    // 清理
    container.remove();
    style.remove();
  }
}

/**
 * 获取文件名（不含扩展名）
 */
export function getExportFileName(filePath: string | null): string {
  if (!filePath) return getCurrentTranslations().common.untitled;
  const parts = filePath.split(/[/\\]/);
  const fileName = parts[parts.length - 1];
  return fileName.replace(/\.md$/i, '');
}
