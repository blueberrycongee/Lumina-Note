pub mod font_manager;
pub mod line_break;
pub mod paragraph_layout;
pub mod pagination;
pub mod page_model;
pub mod pdf_export;
pub mod preview_pipeline;
pub mod preview_viewport;
pub mod shaping;

pub use font_manager::{
    FontData, FontError, FontManager, FontMapping, FontMetrics, ScriptKind,
};
pub use line_break::{break_glyph_run, BreakKind, LineBreak};
pub use paragraph_layout::{layout_paragraph, ParagraphAlign, PositionedLine};
pub use pagination::{paginate_flow, paginate_lines_with_widows_orphans, PageSlice};
pub use page_model::{PageBox, PageMargins, PageSize, PageStyle};
pub use pdf_export::{write_empty_pdf, PdfExportError};
pub use preview_pipeline::{
    build_preview_pages, build_preview_pages_for_style, preview_page_metrics,
    PreviewLine, PreviewPage, PreviewPageMetrics,
};
pub use preview_viewport::{PreviewPageSize, PreviewViewport};
pub use shaping::{shape_mixed_text, shape_text, Glyph, GlyphRun, ShapingError};
