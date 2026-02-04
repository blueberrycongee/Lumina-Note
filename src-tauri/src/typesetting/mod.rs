pub mod font_manager;
pub mod line_break;
pub mod paragraph_layout;
pub mod pagination;
pub mod page_model;
pub mod pdf_export;
pub mod preview_pipeline;
pub mod preview_viewport;
pub mod shaping;
pub mod text_layout;

#[allow(unused_imports)]
pub use font_manager::{
    FontData, FontError, FontManager, FontMapping, FontMetrics, ScriptKind,
};
#[allow(unused_imports)]
pub use line_break::{break_glyph_run, BreakKind, LineBreak};
#[allow(unused_imports)]
pub use paragraph_layout::{layout_paragraph, ParagraphAlign, PositionedLine};
#[allow(unused_imports)]
pub use pagination::{paginate_flow, paginate_lines_with_widows_orphans, PageSlice};
#[allow(unused_imports)]
pub use page_model::{PageBox, PageMargins, PageSize, PageStyle};
#[allow(unused_imports)]
pub use pdf_export::{write_empty_pdf, write_pdf_with_embedded_font, PdfExportError};
#[allow(unused_imports)]
pub use preview_pipeline::{
    build_preview_pages, build_preview_pages_for_style, preview_page_metrics,
    PreviewLine, PreviewPage, PreviewPageMetrics,
};
#[allow(unused_imports)]
pub use preview_viewport::{PreviewPageSize, PreviewViewport};
#[allow(unused_imports)]
pub use shaping::{shape_mixed_text, shape_text, Glyph, GlyphRun, ShapingError};
#[allow(unused_imports)]
pub use text_layout::{layout_text_paragraph, TextLayoutOptions};
