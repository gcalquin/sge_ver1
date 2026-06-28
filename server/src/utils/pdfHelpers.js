function seccionTitulo(doc, texto) {
    doc.moveDown(0.8);
    doc.fontSize(13).fillColor("#1e3a8a").text(texto, { underline: true });
    doc.fillColor("#000000").fontSize(10);
    doc.moveDown(0.3);
}

function lineaDato(doc, etiqueta, valor) {
    doc.fontSize(10).fillColor("#475569").text(etiqueta, { continued: true }).fillColor("#000000").text(` ${valor}`);
}

function encabezadoInstitucional(doc, { colegioNombre, colegioRbd, titulo, subtitulo }) {
    doc.fontSize(14)
        .fillColor("#1e3a8a")
        .text(colegioNombre || "Establecimiento Educacional", { align: "center" });
    if (colegioRbd) {
        doc.fontSize(9).fillColor("#64748b").text(`RBD: ${colegioRbd}`, { align: "center" });
    }
    doc.moveDown(0.5);
    doc.fontSize(9)
        .fillColor("#94a3b8")
        .text(`Documento generado el ${new Date().toLocaleString("es-CL")}`, { align: "center" });
    doc.moveDown(0.8);
    doc.fillColor("#000000");
    doc.moveTo(50, doc.y)
        .lineTo(doc.page.width - 50, doc.y)
        .strokeColor("#cbd5e1")
        .stroke();
    doc.moveDown(0.8);

    doc.fontSize(18).fillColor("#0f172a").text(titulo, { underline: true });
    if (subtitulo) doc.fontSize(11).fillColor("#475569").text(subtitulo);
    doc.fillColor("#000000");
}

function piePaginas(doc, notaFinal) {
    if (notaFinal) {
        seccionTitulo(doc, "Cierre del Documento");
        doc.fontSize(8).fillColor("#94a3b8").text(notaFinal);
    }

    const totalPaginas = doc.bufferedPageRange().count;
    for (let i = 0; i < totalPaginas; i++) {
        doc.switchToPage(i);
        doc.fontSize(8)
            .fillColor("#94a3b8")
            .text(`Página ${i + 1} de ${totalPaginas}`, 50, doc.page.height - 40, {
                width: doc.page.width - 100,
                align: "center",
            });
    }
}

module.exports = { seccionTitulo, lineaDato, encabezadoInstitucional, piePaginas };
