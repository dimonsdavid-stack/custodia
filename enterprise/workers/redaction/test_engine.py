import unittest
import fitz
from engine import sanitize_pdf
import base64

class RedactionTests(unittest.TestCase):
    def test_removed_content_and_flattened_metadata(self):
        doc=fitz.open()
        page=doc.new_page()
        page.insert_text((70,70),'SSN 123-45-6789; public record')
        doc.set_metadata({'author':'secret author'})
        result=sanitize_pdf(doc.tobytes(),{'identifiers':['ssn'],'literalTerms':[]})
        clean=fitz.open(stream=base64.b64decode(result['content']),filetype='pdf')
        self.assertEqual(result['pages'][0]['regions'],1)
        self.assertNotIn('123-45-6789',clean[0].get_text())
        self.assertEqual(clean.metadata.get('author'),'')
        self.assertEqual(clean[0].get_text(),'')
        self.assertTrue(clean[0].get_images())
        clean.close()
        doc.close()
    def test_unsearchable_pdf_rejected(self):
        doc=fitz.open()
        doc.new_page()
        with self.assertRaises(ValueError):sanitize_pdf(doc.tobytes(),{'identifiers':['ssn'],'literalTerms':[]})
        doc.close()
    def test_nonpdf_rejected(self):
        with self.assertRaises(ValueError):sanitize_pdf(b'unsafe',{'identifiers':['ssn'],'literalTerms':[]})

if __name__=='__main__':unittest.main()
