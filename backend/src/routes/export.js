import express from 'express';
import PDFDocument from 'pdfkit';
import { supabase } from '../config/supabase.js';
import { requireAuth } from '../middleware/auth.js';
import { calculateRealizedPnL } from '../services/fifoCalculator.js';
import crypto from 'crypto';

function getISTDateKey() {
  const d = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istTime = new Date(d.getTime() + istOffset);
  return istTime.toISOString().substring(0, 10);
}

function getDailyHistoryKey(userId, dateKey) {
  const hash = crypto.createHash('sha256').update(`HISTORY_${userId}_${dateKey}`).digest('hex');
  return `SETTINGS_${hash.substring(0, 11)}`;
}

async function getLastAssistantMessage(userId) {
  const dateKey = getISTDateKey();
  const key = getDailyHistoryKey(userId, dateKey);
  const { data } = await supabase
    .from('news_cache')
    .select('news_content')
    .eq('stock_symbol', key)
    .maybeSingle();

  if (data && data.news_content && data.news_content.messages) {
    const msgs = data.news_content.messages;
    const assistantMsgs = msgs.filter(m => m.role === 'assistant');
    if (assistantMsgs.length > 0) {
      return assistantMsgs[assistantMsgs.length - 1].content;
    }
  }
  return null;
}

const router = express.Router();

// Helper to draw table rows in PDF
function drawTableRow(doc, y, columns, isHeader = false) {
  const startX = 50;
  let currentX = startX;
  doc.fontSize(isHeader ? 9 : 8);
  doc.font(isHeader ? 'Helvetica-Bold' : 'Helvetica');
  
  if (isHeader) {
    doc.fillColor('#1e293b'); // Dark slate header text
  } else {
    doc.fillColor('#334155'); // Slate body text
  }

  columns.forEach(col => {
    doc.text(col.text, currentX, y, { width: col.width, align: col.align || 'left' });
    currentX += col.width;
  });

  doc.moveTo(startX, y + (isHeader ? 14 : 12))
     .lineTo(startX + columns.reduce((a, b) => a + b.width, 0), y + (isHeader ? 14 : 12))
     .strokeColor('#cbd5e1')
     .lineWidth(0.5)
     .stroke();
}

/**
 * GET /api/export/markdown-pdf
 * Converts the latest assistant markdown statement into a formatted PDF document.
 */
router.get('/markdown-pdf', requireAuth, async (req, res) => {
  try {
    let markdown = await getLastAssistantMessage(req.user.id);
    if (!markdown) {
      markdown = "### Finor Statement\nNo recent assistant messages found. Please ask the Finor AI Assistant a question to generate a report first!";
    }

    // Replace Rupee Unicode character with safe ASCII compatible 'Rs.' to prevent Helvetica font crashing
    markdown = markdown.replace(/₹/g, 'Rs.');

    const doc = new PDFDocument({ margin: 50, size: 'A4' });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=finor_report.pdf');

    doc.pipe(res);

    // Header banner
    doc.rect(0, 0, doc.page.width, 80).fill('#0f172a');
    doc.fillColor('#ffffff')
       .fontSize(16)
       .font('Helvetica-Bold')
       .text('FINOR PERFORMANCE STATEMENT', 50, 25);
    doc.fillColor('#94a3b8')
       .fontSize(8)
       .font('Helvetica')
       .text(`Generated: ${new Date().toLocaleString('en-IN')}`, 50, 48);

    let y = 110;
    const lines = markdown.split('\n');
    let currentTable = [];

    // Helper to render accumulated table
    function renderTable(table) {
      if (table.length === 0) return;
      const numCols = table[0].length;
      const startX = 50;
      const totalWidth = doc.page.width - 100;
      
      // Calculate column widths
      const colWidths = [];
      if (numCols === 2) {
        colWidths.push(200, totalWidth - 200);
      } else {
        // First column wider, rest equal
        const firstWidth = 140;
        colWidths.push(firstWidth);
        const restWidth = (totalWidth - firstWidth) / (numCols - 1);
        for (let i = 1; i < numCols; i++) {
          colWidths.push(restWidth);
        }
      }

      table.forEach((row, rowIndex) => {
        // Page break check
        if (y > doc.page.height - 60) {
          doc.addPage();
          y = 50;
        }

        const isHeader = rowIndex === 0;
        let currentX = startX;
        doc.fontSize(isHeader ? 9 : 8);
        doc.font(isHeader ? 'Helvetica-Bold' : 'Helvetica');
        doc.fillColor(isHeader ? '#0f172a' : '#334155');

        row.forEach((cell, colIndex) => {
          doc.text(cell, currentX, y, { width: colWidths[colIndex], align: colIndex === 0 ? 'left' : 'right' });
          currentX += colWidths[colIndex];
        });

        // Draw line
        doc.moveTo(startX, y + (isHeader ? 14 : 12))
           .lineTo(startX + totalWidth, y + (isHeader ? 14 : 12))
           .strokeColor(isHeader ? '#475569' : '#cbd5e1')
           .lineWidth(isHeader ? 1 : 0.5)
           .stroke();

        y += isHeader ? 22 : 18;
      });

      y += 10;
    }

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // Check if table row
      if (line.startsWith('|') && line.endsWith('|')) {
        // Check if divider line
        if (line.includes('---') || line.includes('-:-')) {
          continue;
        }
        const cells = line.split('|').map(c => c.trim()).filter((c, idx, arr) => idx > 0 && idx < arr.length - 1);
        currentTable.push(cells);
        continue;
      }

      // If we were parsing a table and now it's not a table line
      if (currentTable.length > 0) {
        renderTable(currentTable);
        currentTable = [];
      }

      if (!line) {
        y += 8;
        continue;
      }

      // Check for headings
      if (line.startsWith('#')) {
        const level = line.match(/^#+/)[0].length;
        const text = line.replace(/^#+\s*/, '');
        
        if (y > doc.page.height - 80) {
          doc.addPage();
          y = 50;
        }

        doc.fontSize(level === 1 ? 14 : level === 2 ? 12 : 10)
           .font('Helvetica-Bold')
           .fillColor('#0f172a')
           .text(text, 50, y);
        y += level === 1 ? 22 : level === 2 ? 18 : 15;
      }
      // Check for list items
      else if (line.startsWith('-') || line.startsWith('*')) {
        const text = line.replace(/^[-*]\s*/, '');
        if (y > doc.page.height - 40) {
          doc.addPage();
          y = 50;
        }
        doc.fontSize(9)
           .font('Helvetica')
           .fillColor('#334155');
        doc.text('•', 50, y, { width: 10 });
        doc.text(text, 65, y, { width: doc.page.width - 115 });
        y += doc.heightOfString(text, { width: doc.page.width - 115 }) + 4;
      }
      // Plain text
      else {
        if (y > doc.page.height - 40) {
          doc.addPage();
          y = 50;
        }
        doc.fontSize(9)
           .font('Helvetica')
           .fillColor('#334155');
        doc.text(line, 50, y, { width: doc.page.width - 100 });
        y += doc.heightOfString(line, { width: doc.page.width - 100 }) + 6;
      }
    }

    // If final block was a table
    if (currentTable.length > 0) {
      renderTable(currentTable);
    }

    doc.end();
  } catch (err) {
    console.error('[ExportRoute] Failed to export custom markdown to PDF:', err.message);
    res.status(500).json({ error: 'Failed to generate PDF.' });
  }
});

/**
 * GET /api/export/markdown-csv
 * Extracts the first table from the latest assistant markdown and downloads it as a CSV file.
 */
router.get('/markdown-csv', requireAuth, async (req, res) => {
  try {
    let markdown = await getLastAssistantMessage(req.user.id);
    if (!markdown) {
      markdown = "### Finor Statement\nNo recent assistant messages found. Please ask the Finor AI Assistant a question to generate a report first!";
    }

    // Replace Rupee Unicode characters with safe ASCII compatible 'Rs.' for clean CSV encoding
    markdown = markdown.replace(/₹/g, 'Rs.');

    const lines = markdown.split('\n');
    let csvRows = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith('|') && line.endsWith('|')) {
        if (line.includes('---') || line.includes('-:-')) {
          continue;
        }
        const cells = line.split('|').map(c => c.trim()).filter((c, idx, arr) => idx > 0 && idx < arr.length - 1);
        
        // Escape quotes and commas in CSV cells
        const escapedCells = cells.map(cell => {
          let clean = cell.replace(/"/g, '""');
          if (clean.includes(',') || clean.includes('\n') || clean.includes('"')) {
            clean = `"${clean}"`;
          }
          return clean;
        });

        csvRows.push(escapedCells.join(','));
      }
    }

    const csvContent = csvRows.join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=finor_report.csv');
    res.status(200).send(csvContent);
  } catch (err) {
    console.error('[ExportRoute] Failed to export custom markdown to CSV:', err.message);
    res.status(500).json({ error: 'Failed to generate CSV.' });
  }
});

/**
 * GET /api/export/pnl-pdf
 * Generates a native PDF document of the user's realized profit & loss.
 */
router.get('/pnl-pdf', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;

    // Fetch user name
    let userName = 'Arivu';
    if (req.user) {
      userName = req.user.user_metadata?.full_name || req.user.user_metadata?.name || req.user.email?.split('@')[0] || 'Investor';
      if (userName.toLowerCase().includes('arivu')) userName = 'Arivu';
    }

    // Fetch trades
    const { data: trades, error } = await supabase
      .from('trades')
      .select('*')
      .eq('user_id', userId)
      .order('trade_date', { ascending: true });

    if (error) throw error;

    // Calculate FIFO reports
    const report = calculateRealizedPnL(trades || []);
    const closedTrades = report.closed_trades || [];
    const summary = report.summary || { total_realized_pnl: 0, stcg: 0, ltcg: 0 };

    // Group month-wise
    const monthWise = {};
    closedTrades.forEach(t => {
      const date = new Date(t.sell_date);
      const key = date.toLocaleString('default', { month: 'long', year: 'numeric' });
      if (!monthWise[key]) monthWise[key] = { pnl: 0, count: 0, bestStock: '', bestPnL: -Infinity, stockPnLs: {} };
      monthWise[key].pnl += t.realized_pnl;
      monthWise[key].count += 1;
      
      if (!monthWise[key].stockPnLs[t.stock_symbol]) monthWise[key].stockPnLs[t.stock_symbol] = 0;
      monthWise[key].stockPnLs[t.stock_symbol] += t.realized_pnl;
    });

    // Populate best stock per month
    Object.keys(monthWise).forEach(m => {
      let best = '';
      let max = -Infinity;
      Object.entries(monthWise[m].stockPnLs).forEach(([sym, val]) => {
        if (val > max) {
          max = val;
          best = sym;
        }
      });
      monthWise[m].bestStock = best;
      monthWise[m].bestPnL = max;
    });

    // Group stock-wise
    const stockWise = {};
    closedTrades.forEach(t => {
      const sym = t.stock_symbol;
      if (!stockWise[sym]) stockWise[sym] = { qty: 0, cost: 0, val: 0, pnl: 0, stcg: 0, ltcg: 0 };
      stockWise[sym].qty += t.quantity;
      stockWise[sym].cost += t.quantity * t.buy_price;
      stockWise[sym].val += t.quantity * t.sell_price;
      stockWise[sym].pnl += t.realized_pnl;
      if (t.gains_type === 'STCG') {
        stockWise[sym].stcg += t.realized_pnl;
      } else {
        stockWise[sym].ltcg += t.realized_pnl;
      }
    });

    // Create PDFkit Document
    const doc = new PDFDocument({ margin: 50, size: 'A4' });

    // Set Response Headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=finor_realized_pnl_statement.pdf`);

    // Stream PDF directly to client response
    doc.pipe(res);

    // BRAND COLOR SCHEME (Premium Navy & Sky Blue)
    const primaryColor = '#0f172a'; // Navy
    const accentColor = '#0284c7';  // Sky Blue
    const lightBg = '#f8fafc';

    // 1. Header Banner
    doc.rect(0, 0, doc.page.width, 100).fill(primaryColor);
    
    // Header Content
    doc.fillColor('#ffffff')
       .fontSize(20)
       .font('Helvetica-Bold')
       .text('FINOR STATEMENT', 50, 30);

    doc.fillColor('#e2e8f0')
       .fontSize(9)
       .font('Helvetica')
       .text('Realized Profit & Loss and Capital Gains Ledger (FIFO Method)', 50, 55);

    // User details on top right banner area
    doc.fillColor('#ffffff')
       .fontSize(10)
       .font('Helvetica-Bold')
       .text(`Client: ${userName}`, doc.page.width - 250, 30, { align: 'right', width: 200 });

    doc.fillColor('#94a3b8')
       .fontSize(8)
       .font('Helvetica')
       .text(`Generated: ${new Date().toLocaleString('en-IN')}`, doc.page.width - 250, 45, { align: 'right', width: 200 });

    // 2. Metrics Block
    let y = 120;
    
    // Background card for metrics
    doc.rect(50, y, doc.page.width - 100, 70).fill(lightBg);
    doc.rect(50, y, doc.page.width - 100, 70).strokeColor('#e2e8f0').lineWidth(1).stroke();

    // Metric Columns
    const stcgTax = Math.max(0, summary.stcg * 0.15);
    const ltcgTax = Math.max(0, summary.ltcg * 0.10);
    const totalTax = stcgTax + ltcgTax;

    doc.fillColor('#64748b').fontSize(8).font('Helvetica').text('TOTAL REALIZED P&L', 70, y + 15);
    const pnlColor = summary.total_realized_pnl >= 0 ? '#10b981' : '#ef4444';
    const pnlSign = summary.total_realized_pnl >= 0 ? '+' : '';
    doc.fillColor(pnlColor).fontSize(14).font('Helvetica-Bold').text(`${pnlSign}Rs. ${summary.total_realized_pnl.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, 70, y + 30);

    doc.fillColor('#64748b').fontSize(8).font('Helvetica').text('SHORT-TERM GAINS (STCG)', 200, y + 15);
    doc.fillColor(summary.stcg >= 0 ? '#0f172a' : '#ef4444').fontSize(11).font('Helvetica-Bold').text(`Rs. ${summary.stcg.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, 200, y + 30);

    doc.fillColor('#64748b').fontSize(8).font('Helvetica').text('LONG-TERM GAINS (LTCG)', 330, y + 15);
    doc.fillColor(summary.ltcg >= 0 ? '#0f172a' : '#ef4444').fontSize(11).font('Helvetica-Bold').text(`Rs. ${summary.ltcg.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, 330, y + 30);

    doc.fillColor('#64748b').fontSize(8).font('Helvetica').text('EST. INCOME TAX LIABILITY', 460, y + 15);
    doc.fillColor(totalTax > 0 ? '#f59e0b' : '#64748b').fontSize(11).font('Helvetica-Bold').text(`Rs. ${totalTax.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, 460, y + 30);

    // 3. Month-wise Performance Table
    y = 210;
    doc.fillColor(primaryColor).fontSize(12).font('Helvetica-Bold').text('Month-wise Performance Summary', 50, y);
    y += 18;

    const monthCols = [
      { text: 'MONTH', width: 120 },
      { text: 'TRADES COUNT', width: 90, align: 'right' },
      { text: 'BEST STOCK', width: 120, align: 'right' },
      { text: 'REALIZED P&L (INR)', width: 160, align: 'right' }
    ];
    drawTableRow(doc, y, monthCols, true);
    y += 18;

    const monthEntries = Object.entries(monthWise);
    if (monthEntries.length === 0) {
      doc.fillColor('#94a3b8').fontSize(9).font('Helvetica').text('No trade outcomes logged.', 70, y);
      y += 18;
    } else {
      monthEntries.forEach(([month, mData]) => {
        const sign = mData.pnl >= 0 ? '+' : '';
        const mCols = [
          { text: month, width: 120 },
          { text: String(mData.count), width: 90, align: 'right' },
          { text: mData.bestStock || '-', width: 120, align: 'right' },
          { text: `${sign}Rs. ${mData.pnl.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, width: 160, align: 'right' }
        ];
        drawTableRow(doc, y, mCols);
        y += 18;
      });
    }

    // 4. Stock-wise Performance Table
    y += 15;
    doc.fillColor(primaryColor).fontSize(12).font('Helvetica-Bold').text('Stock-wise Realized Returns', 50, y);
    y += 18;

    const stockCols = [
      { text: 'STOCK', width: 100 },
      { text: 'QTY', width: 60, align: 'right' },
      { text: 'BUY VALUE (Rs.)', width: 100, align: 'right' },
      { text: 'SELL VALUE (Rs.)', width: 100, align: 'right' },
      { text: 'STCG (Rs.)', width: 65, align: 'right' },
      { text: 'LTCG (Rs.)', width: 65, align: 'right' },
      { text: 'NET P&L (Rs.)', width: 94, align: 'right' }
    ];
    
    // Check if we need to start a new page
    if (y > doc.page.height - 120) {
      doc.addPage();
      y = 50;
    }
    
    drawTableRow(doc, y, stockCols, true);
    y += 18;

    const stockEntries = Object.entries(stockWise);
    if (stockEntries.length === 0) {
      doc.fillColor('#94a3b8').fontSize(9).font('Helvetica').text('No stocks traded.', 70, y);
    } else {
      stockEntries.forEach(([stock, sData]) => {
        // Page break safety check
        if (y > doc.page.height - 50) {
          doc.addPage();
          y = 50;
          drawTableRow(doc, y, stockCols, true);
          y += 18;
        }

        const sign = sData.pnl >= 0 ? '+' : '';
        const sCols = [
          { text: stock, width: 100 },
          { text: String(sData.qty), width: 60, align: 'right' },
          { text: sData.cost.toFixed(2), width: 100, align: 'right' },
          { text: sData.val.toFixed(2), width: 100, align: 'right' },
          { text: sData.stcg.toFixed(2), width: 65, align: 'right' },
          { text: sData.ltcg.toFixed(2), width: 65, align: 'right' },
          { text: `${sign}${sData.pnl.toFixed(2)}`, width: 94, align: 'right' }
        ];
        drawTableRow(doc, y, sCols);
        y += 18;
      });
    }

    // Footnote
    if (y > doc.page.height - 60) {
      doc.addPage();
      y = 50;
    }
    y += 20;
    doc.fillColor('#94a3b8')
       .fontSize(7)
       .font('Helvetica-Oblique')
       .text('Disclaimer: This report is generated dynamically by Finor based on the transaction logs present in the ledger database. STCG estimates are at 15% and LTCG at 10% (excluding cess/surcharges). Please consult a certified financial planner or tax advisor for actual filing.', 50, y, { width: doc.page.width - 100, align: 'center' });

    // End Document
    doc.end();
  } catch (err) {
    console.error('[ExportRoute] Failed to generate P&L PDF:', err.message);
    res.status(500).json({ error: 'Failed to generate PDF report.' });
  }
});

/**
 * GET /api/export/pnl-csv
 * Generates a detailed trades P&L CSV statement.
 */
router.get('/pnl-csv', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;

    // Fetch trades
    const { data: trades, error } = await supabase
      .from('trades')
      .select('*')
      .eq('user_id', userId)
      .order('trade_date', { ascending: true });

    if (error) throw error;

    const report = calculateRealizedPnL(trades || []);
    const closedTrades = report.closed_trades || [];

    let csvContent = "Stock,Quantity,Buy Date,Sell Date,Buy Price (\u20B9),Sell Price (\u20B9),Realized P&L (\u20B9),Holding Days,Tax Classification\n";
    closedTrades.forEach((trade) => {
      const buyDateStr = new Date(trade.buy_date).toLocaleDateString('en-IN');
      const sellDateStr = new Date(trade.sell_date).toLocaleDateString('en-IN');
      const taxClass = trade.holding_days > 365 ? "LTCG" : "STCG";
      csvContent += `${trade.stock_symbol},${trade.quantity},${buyDateStr},${sellDateStr},${trade.buy_price.toFixed(2)},${trade.sell_price.toFixed(2)},${trade.realized_pnl.toFixed(2)},${trade.holding_days},${taxClass}\n`;
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=finor_realized_pnl_ledger.csv');
    res.status(200).send(csvContent);
  } catch (err) {
    console.error('[ExportRoute] Failed to generate P&L CSV:', err.message);
    res.status(500).json({ error: 'Failed to generate CSV report.' });
  }
});

/**
 * GET /api/export/holdings-csv
 * Generates an active holdings CSV statement.
 */
router.get('/holdings-csv', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;

    const { data: holdings, error } = await supabase
      .from('holdings')
      .select('*')
      .eq('user_id', userId);

    if (error) throw error;

    let csvContent = "Stock,Quantity,Avg Buy Price (\u20B9),LTP (\u20B9),Invested Value (\u20B9),Current Value (\u20B9),P&L (\u20B9),P&L (%)\n";
    (holdings || []).forEach((h) => {
      const invested = h.quantity * h.average_buy_price;
      const current = h.quantity * (h.ltp || h.average_buy_price);
      const pnl = current - invested;
      const pnlPct = invested > 0 ? (pnl / invested) * 100 : 0;
      csvContent += `${h.stock_symbol},${h.quantity},${h.average_buy_price.toFixed(2)},${(h.ltp || 0).toFixed(2)},${invested.toFixed(2)},${current.toFixed(2)},${pnl.toFixed(2)},${pnlPct.toFixed(2)}\n`;
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=finor_holdings_statement.csv');
    res.status(200).send(csvContent);
  } catch (err) {
    console.error('[ExportRoute] Failed to generate holdings CSV:', err.message);
    res.status(500).json({ error: 'Failed to generate CSV report.' });
  }
});

export default router;
