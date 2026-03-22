const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const PDFDocument = require('pdfkit');
const sharp = require('sharp');
const mammoth = require('mammoth');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = 3000;

const UPLOAD_DIR = path.join(__dirname, 'uploads');
const OUTPUT_DIR = path.join(__dirname, 'output');

// Create directories
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

app.use(express.static('public'));
app.use(express.json());

// Multer configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueName + path.extname(file.originalname).toLowerCase());
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const allowed = ['.jpg', '.jpeg', '.png', '.txt', '.docx'];
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Unsupported file type. Only JPG, PNG, TXT, DOCX allowed.'), false);
    }
  }
});

// ====================== UPLOAD ENDPOINT ======================
app.post('/upload', (req, res) => {
  const uploadMiddleware = upload.array('files', 20); // max 20 files

  uploadMiddleware(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'File too large (max 10MB per file)' });
      }
      return res.status(400).json({ error: err.message });
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    const fileList = req.files.map(file => ({
      filename: file.filename,
      originalname: file.originalname,
      size: file.size
    }));

    res.json({ success: true, files: fileList });
  });
});

// ====================== CONVERT ENDPOINT ======================
app.post('/convert', async (req, res) => {
  const { files } = req.body;
  if (!files || !Array.isArray(files) || files.length === 0) {
    return res.status(400).json({ error: 'No files to convert' });
  }

  const pdfFilename = `converted-${uuidv4()}.pdf`;
  const pdfPath = path.join(OUTPUT_DIR, pdfFilename);

  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  const writeStream = fs.createWriteStream(pdfPath);
  doc.pipe(writeStream);

  try {
    for (const file of files) {
      const filePath = path.join(UPLOAD_DIR, file.filename);
      const ext = path.extname(file.originalname).toLowerCase();

      // ==================== IMAGE TO PDF ====================
      if (['.jpg', '.jpeg', '.png'].includes(ext)) {
        doc.addPage();

        // Optimize image with Sharp (maintains quality + reduces size)
        let imageBuffer;
        if (ext === '.png') {
          imageBuffer = await sharp(filePath)
            .resize({ width: 800, withoutEnlargement: true })
            .png({ compressionLevel: 9 })
            .toBuffer();
        } else {
          imageBuffer = await sharp(filePath)
            .resize({ width: 800, withoutEnlargement: true })
            .jpeg({ quality: 92 })
            .toBuffer();
        }

        const pageWidth = doc.page.width - 100;
        const pageHeight = doc.page.height - 100;

        doc.image(imageBuffer, {
          fit: [pageWidth, pageHeight],
          align: 'center',
          valign: 'center'
        });
      }

      // ==================== TXT / DOCX TO PDF ====================
      else if (ext === '.txt' || ext === '.docx') {
        let textContent = '';

        if (ext === '.txt') {
          textContent = fs.readFileSync(filePath, 'utf8');
        } else {
          const result = await mammoth.convertToHtml({ path: filePath });
          // Preserve paragraphs while stripping other HTML
          textContent = result.value
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<p[^>]*>/gi, '\n\n')
            .replace(/<\/p>/gi, '\n')
            .replace(/<[^>]+>/g, ' ')
            .replace(/&nbsp;/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        }

        doc.addPage();
        doc.fontSize(12);
        addMultiPageText(doc, textContent);
      }
    }

    doc.end();

    await new Promise((resolve, reject) => {
      writeStream.on('finish', resolve);
      writeStream.on('error', reject);
    });

    // Clean temporary upload files after successful conversion
    const uploadedFiles = fs.readdirSync(UPLOAD_DIR);
    for (const f of uploadedFiles) {
      fs.unlinkSync(path.join(UPLOAD_DIR, f));
    }

    res.json({ success: true, pdfFilename });
  } catch (error) {
    console.error(error);
    if (fs.existsSync(pdfPath)) fs.unlinkSync(pdfPath);
    res.status(500).json({ error: 'Conversion failed: ' + error.message });
  }
});

// Helper: Auto pagination for long text (DOCX/TXT)
function addMultiPageText(doc, text) {
  const paragraphs = text.split('\n\n');
  const usableWidth = doc.page.width - 100;

  paragraphs.forEach((para) => {
    if (!para.trim()) return;

    const estimatedHeight = doc.heightOfString(para.trim(), { width: usableWidth });

    // Add new page if text won't fit
    if (doc.y + estimatedHeight > doc.page.height - 50) {
      doc.addPage();
    }

    doc.text(para.trim(), 50, doc.y, {
      width: usableWidth,
      align: 'left',
      paragraphGap: 12,
      lineGap: 4
    });
    // doc.y is automatically updated by PDFKit after text()
  });
}

// ====================== DOWNLOAD ENDPOINT ======================
app.get('/download/:filename', (req, res) => {
  const filePath = path.join(OUTPUT_DIR, req.params.filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).send('PDF not found');
  }

  res.download(filePath, 'converted.pdf', (err) => {
    if (!err) {
      // Delete PDF after download completes
      setTimeout(() => {
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      }, 2000);
    }
  });
});

app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});