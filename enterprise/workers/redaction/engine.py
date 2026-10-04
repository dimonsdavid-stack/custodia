import base64
import hashlib
import re
import unicodedata
import fitz

PATTERNS = {
    'ssn': r'\b\d{3}[\s-]?\d{2}[\s-]?\d{4}\b',
    'ein': r'\b\d{2}-\d{7}\b',
    'email': r'\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b',
    'phone': r'(?<!\d)(?:\+1[ .-]?)?(?:\(\d{3}\)|\d{3})[ .-]?\d{3}[ .-]?\d{4}(?!\d)',
}

def sanitize_pdf(content, policy):
    if len(content) > 5 * 1024 * 1024 or not content.startswith(b'%PDF-'):
        raise ValueError('Invalid PDF input')
    source = fitz.open(stream=content, filetype='pdf')
    output = fitz.open()
    try:
        if source.needs_pass or source.page_count > 100 or source.page_count == 0:
            raise ValueError('Encrypted, empty or oversized PDF rejected')
        if set(policy['identifiers']) - set(PATTERNS) or len(policy['literalTerms']) > 100:
            raise ValueError('Invalid policy')
        expressions = [re.compile(PATTERNS[k], re.IGNORECASE) for k in policy['identifiers']]
        expressions += [re.compile(re.escape(term), re.IGNORECASE) for term in policy['literalTerms']]
        report = []
        for page in source:
            if page.get_images(full=True):
                raise ValueError('Image-bearing PDFs require verified OCR and human image review')
            text = page.get_text()
            if not text.strip():
                raise ValueError('Unsearchable PDF page requires OCR')
            if text != unicodedata.normalize('NFKC', text) or re.search(r'[\u200B-\u200D\uFEFF]', text):
                raise ValueError('Noncanonical PDF text requires normalized review')
            if page.rect.width > 2000 or page.rect.height > 2000:
                raise ValueError('PDF page dimensions exceed limit')
            rectangles = []
            for expression in expressions:
                for match in expression.finditer(text):
                    boxes = page.search_for(match.group(0))
                    if not boxes:
                        raise ValueError('Sensitive text could not be located geometrically')
                    rectangles.extend(boxes)
            if len(rectangles) > 10000:
                raise ValueError('Redaction count exceeds limit')
            for rectangle in rectangles:
                page.add_redact_annot(rectangle, fill=(0, 0, 0))
            page.apply_redactions(images=2, graphics=2, text=0)
            remaining = page.get_text()
            if any(expression.search(remaining) for expression in expressions):
                raise ValueError('Post-redaction detection failed')
            pix = page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False, annots=False)
            target = output.new_page(width=page.rect.width, height=page.rect.height)
            target.insert_image(target.rect, stream=pix.tobytes('png'))
            report.append({'page': page.number + 1, 'regions': len(rectangles)})
        output.set_metadata({})
        sanitized = output.tobytes(garbage=4, deflate=True, clean=True)
        if len(sanitized) > 20 * 1024 * 1024:
            raise ValueError('Output exceeds limit')
        return {'content': base64.b64encode(sanitized).decode('ascii'), 'sha256': hashlib.sha256(sanitized).hexdigest(), 'pages': report, 'flattened': True}
    finally:
        source.close()
        output.close()
