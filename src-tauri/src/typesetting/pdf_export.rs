use super::PageStyle;
use thiserror::Error;

#[derive(Debug, Error, PartialEq)]
pub enum PdfExportError {
    #[error("invalid page size")]
    InvalidPageSize,
    #[error("invalid font data")]
    InvalidFontData,
}

pub fn write_empty_pdf(page_style: PageStyle) -> Result<Vec<u8>, PdfExportError> {
    let page_box = page_style.page_box();
    let width_pt = mm_to_pt(page_box.width_mm);
    let height_pt = mm_to_pt(page_box.height_mm);

    if width_pt <= 0.0 || height_pt <= 0.0 {
        return Err(PdfExportError::InvalidPageSize);
    }

    let mut output = String::new();
    output.push_str("%PDF-1.7\n");

    let mut offsets = vec![0usize; 5];

    offsets[1] =
        write_object(&mut output, 1, "<< /Type /Catalog /Pages 2 0 R >>");
    offsets[2] = write_object(
        &mut output,
        2,
        "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    );

    let page_body = format!(
        "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {:.2} {:.2}] /Contents 4 0 R >>",
        width_pt, height_pt
    );
    offsets[3] = write_object(&mut output, 3, &page_body);

    let contents = "<< /Length 0 >>\nstream\n\nendstream";
    offsets[4] = write_object(&mut output, 4, contents);

    let xref_offset = output.len();
    output.push_str("xref\n");
    output.push_str(&format!("0 {}\n", offsets.len()));
    output.push_str("0000000000 65535 f \n");
    for offset in offsets.iter().skip(1) {
        output.push_str(&format!("{:010} 00000 n \n", offset));
    }
    output.push_str("trailer\n");
    output.push_str(&format!(
        "<< /Size {} /Root 1 0 R >>\n",
        offsets.len()
    ));
    output.push_str("startxref\n");
    output.push_str(&format!("{}\n", xref_offset));
    output.push_str("%%EOF\n");

    Ok(output.into_bytes())
}

pub fn write_pdf_with_embedded_font(
    page_style: PageStyle,
    font_name: &str,
    font_bytes: &[u8],
) -> Result<Vec<u8>, PdfExportError> {
    let page_box = page_style.page_box();
    let width_pt = mm_to_pt(page_box.width_mm);
    let height_pt = mm_to_pt(page_box.height_mm);

    if width_pt <= 0.0 || height_pt <= 0.0 {
        return Err(PdfExportError::InvalidPageSize);
    }

    if font_bytes.is_empty() {
        return Err(PdfExportError::InvalidFontData);
    }

    let face =
        ttf_parser::Face::from_slice(font_bytes, 0).map_err(|_| {
            PdfExportError::InvalidFontData
        })?;
    let bbox = face.global_bounding_box();
    let ascent = face.ascender() as i32;
    let descent = face.descender() as i32;
    let cap_height = ascent;
    let subset_name = subset_font_name(font_name, font_bytes);
    let font_stream_data = font_file_stream_data(font_bytes);
    let font_stream_len = font_stream_data.len();
    let font_len1 = font_bytes.len();

    let mut output = String::new();
    output.push_str("%PDF-1.7\n");

    let mut offsets = vec![0usize; 8];

    offsets[1] =
        write_object(&mut output, 1, "<< /Type /Catalog /Pages 2 0 R >>");
    offsets[2] = write_object(
        &mut output,
        2,
        "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    );

    let page_body = format!(
        "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {:.2} {:.2}] \
/Resources << /Font << /F1 7 0 R >> >> /Contents 4 0 R >>",
        width_pt, height_pt
    );
    offsets[3] = write_object(&mut output, 3, &page_body);

    let contents = "<< /Length 0 >>\nstream\n\nendstream";
    offsets[4] = write_object(&mut output, 4, contents);

    let font_descriptor = format!(
        "<< /Type /FontDescriptor /FontName /{name} /Flags 32 \
/FontBBox [{x_min} {y_min} {x_max} {y_max}] /ItalicAngle 0 /Ascent {ascent} \
/Descent {descent} /CapHeight {cap_height} /StemV 80 /FontFile2 6 0 R >>",
        name = subset_name,
        x_min = bbox.x_min,
        y_min = bbox.y_min,
        x_max = bbox.x_max,
        y_max = bbox.y_max,
        ascent = ascent,
        descent = descent,
        cap_height = cap_height
    );
    offsets[5] = write_object(&mut output, 5, &font_descriptor);

    let font_file = format!(
        "<< /Length {} /Filter /ASCIIHexDecode /Length1 {} >>\nstream\n{}endstream",
        font_stream_len, font_len1, font_stream_data
    );
    offsets[6] = write_object(&mut output, 6, &font_file);

    let font_body = format!(
        "<< /Type /Font /Subtype /TrueType /BaseFont /{name} \
/FirstChar 32 /LastChar 32 /Widths [0] /Encoding /WinAnsiEncoding \
/FontDescriptor 5 0 R >>",
        name = subset_name
    );
    offsets[7] = write_object(&mut output, 7, &font_body);

    let xref_offset = output.len();
    output.push_str("xref\n");
    output.push_str(&format!("0 {}\n", offsets.len()));
    output.push_str("0000000000 65535 f \n");
    for offset in offsets.iter().skip(1) {
        output.push_str(&format!("{:010} 00000 n \n", offset));
    }
    output.push_str("trailer\n");
    output.push_str(&format!(
        "<< /Size {} /Root 1 0 R >>\n",
        offsets.len()
    ));
    output.push_str("startxref\n");
    output.push_str(&format!("{}\n", xref_offset));
    output.push_str("%%EOF\n");

    Ok(output.into_bytes())
}

fn write_object(output: &mut String, id: usize, body: &str) -> usize {
    let offset = output.len();
    output.push_str(&format!("{} 0 obj\n", id));
    output.push_str(body);
    output.push_str("\nendobj\n");
    offset
}

const POINTS_PER_INCH: f32 = 72.0;
const MM_PER_INCH: f32 = 25.4;

fn mm_to_pt(mm: f32) -> f32 {
    let mm = mm.max(0.0);
    let pt = mm * POINTS_PER_INCH / MM_PER_INCH;
    if pt.is_finite() {
        pt
    } else {
        0.0
    }
}

fn subset_font_name(font_name: &str, font_bytes: &[u8]) -> String {
    let tag = subset_tag(font_bytes);
    let name = sanitize_pdf_name(font_name);
    format!("{tag}+{name}")
}

fn subset_tag(font_bytes: &[u8]) -> String {
    let mut acc: u32 = 0;
    for (idx, byte) in font_bytes.iter().take(32).enumerate() {
        acc = acc.wrapping_add(*byte as u32);
        acc = acc.wrapping_add(idx as u32);
    }

    let mut tag = String::with_capacity(6);
    for idx in 0..6 {
        let seed = acc
            .wrapping_add((idx as u32) * 13)
            .wrapping_add(
                font_bytes.get(idx).copied().unwrap_or_default() as u32,
            );
        let letter = (seed % 26) as u8 + b'A';
        tag.push(letter as char);
    }
    tag
}

fn sanitize_pdf_name(name: &str) -> String {
    let mut output = String::with_capacity(name.len());
    for ch in name.chars() {
        if ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' {
            output.push(ch);
        } else if ch.is_ascii_whitespace() {
            output.push('-');
        } else {
            output.push('-');
        }
    }
    if output.is_empty() {
        output.push_str("Font");
    }
    output
}

fn font_file_stream_data(font_bytes: &[u8]) -> String {
    let mut encoded = encode_hex(font_bytes);
    encoded.push('>');
    encoded.push('\n');
    encoded
}

fn encode_hex(bytes: &[u8]) -> String {
    let mut output = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        use std::fmt::Write;
        write!(&mut output, "{:02X}", byte).expect("hex write");
    }
    output
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::typesetting::{PageMargins, PageSize};

    fn sample_style(size: PageSize) -> PageStyle {
        PageStyle {
            size,
            margins: PageMargins {
                top_mm: 10.0,
                right_mm: 10.0,
                bottom_mm: 10.0,
                left_mm: 10.0,
            },
            header_height_mm: 8.0,
            footer_height_mm: 6.0,
        }
    }

    fn fixture_font_path() -> std::path::PathBuf {
        std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("tests")
            .join("fixtures")
            .join("katex-main-regular.ttf")
    }

    fn fixture_font_bytes() -> Vec<u8> {
        std::fs::read(fixture_font_path()).expect("read font fixture")
    }

    #[test]
    fn empty_pdf_contains_header_xref_and_eof() {
        let pdf = write_empty_pdf(sample_style(PageSize::A4)).unwrap();
        let text = String::from_utf8(pdf).unwrap();

        assert!(text.starts_with("%PDF-1.7\n"));
        assert!(text.contains("\nxref\n"));
        assert!(text.ends_with("%%EOF\n"));
    }

    #[test]
    fn media_box_matches_page_size() {
        let style = sample_style(PageSize::Letter);
        let page_box = style.page_box();
        let expected = format!(
            "/MediaBox [0 0 {:.2} {:.2}]",
            mm_to_pt(page_box.width_mm),
            mm_to_pt(page_box.height_mm)
        );

        let pdf = write_empty_pdf(style).unwrap();
        let text = String::from_utf8(pdf).unwrap();

        assert!(text.contains(&expected));
    }

    #[test]
    fn invalid_page_size_errors() {
        let style = sample_style(PageSize::Custom {
            width_mm: 0.0,
            height_mm: 120.0,
        });

        assert_eq!(
            write_empty_pdf(style).unwrap_err(),
            PdfExportError::InvalidPageSize
        );
    }

    #[test]
    fn embedded_font_pdf_includes_font_objects() {
        let font_bytes = fixture_font_bytes();
        let pdf = write_pdf_with_embedded_font(
            sample_style(PageSize::A4),
            "KaTeX Main Regular",
            &font_bytes,
        )
        .unwrap();
        let text = String::from_utf8(pdf).unwrap();

        assert!(text.contains("/FontDescriptor"));
        assert!(text.contains("/FontFile2"));
        assert!(text.contains("/Subtype /TrueType"));
        assert!(text.contains("/Filter /ASCIIHexDecode"));
        assert!(text.contains("/BaseFont /"));
        assert!(text.contains("+KaTeX-Main-Regular"));
    }

    #[test]
    fn embedded_font_errors_on_invalid_font_data() {
        let err = write_pdf_with_embedded_font(
            sample_style(PageSize::A4),
            "BadFont",
            b"not-a-font",
        )
        .unwrap_err();

        assert_eq!(err, PdfExportError::InvalidFontData);
    }
}
