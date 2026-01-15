/**
 * ExportManager - Handles map export functionality
 * Extracted from app.js as part of Phase 1 refactoring
 */

import { ErrorHandler } from '../error-handler.js';

export class ExportManager {
    /**
     * @param {Object} app - Reference to main app instance
     */
    constructor(app) {
        this.app = app;
    }

    /**
     * Export current map view to PNG image
     * @returns {Promise<void>}
     */
    async exportToPNG() {
        const btn = document.getElementById('export-btn');
        const originalHTML = btn.innerHTML;

        btn.innerHTML = '<div class="animate-spin h-4 w-4 border-2 border-gray-700 border-t-transparent rounded-full"></div> Exporting...';
        btn.disabled = true;

        try {
            // Create a composite canvas
            const mapContainer = document.getElementById('map');
            const rect = mapContainer.getBoundingClientRect();
            const width = rect.width;
            const height = rect.height;

            const exportCanvas = document.createElement('canvas');
            exportCanvas.width = width;
            exportCanvas.height = height;
            const ctx = exportCanvas.getContext('2d');

            // Draw map tiles background
            ctx.fillStyle = this.app.isDarkMode ? '#0f172a' : '#f9fafb';
            ctx.fillRect(0, 0, width, height);

            // Draw the isochrone canvas
            if (this.app.canvasLayer && this.app.canvasLayer.canvas) {
                ctx.drawImage(this.app.canvasLayer.canvas, 0, 0);
            }

            // Add legend
            this.drawLegend(ctx, width, height);

            // Download the image
            this.downloadImage(exportCanvas);

        } catch (err) {
            console.error('Export failed:', err);
            ErrorHandler.showError(
                'Failed to export map image',
                err,
                'EXPORT'
            );
        } finally {
            btn.innerHTML = originalHTML;
            btn.disabled = false;
        }
    }

    /**
     * Draw legend on export canvas
     * @private
     * @param {CanvasRenderingContext2D} ctx - Canvas context
     * @param {number} width - Canvas width
     * @param {number} height - Canvas height
     */
    drawLegend(ctx, width, height) {
        const legendX = 20;
        const legendY = height - 100;
        const legendWidth = 200;
        const legendHeight = 80;

        // Legend background
        ctx.fillStyle = this.app.isDarkMode
            ? 'rgba(30, 41, 59, 0.9)'
            : 'rgba(255, 255, 255, 0.9)';
        ctx.roundRect(legendX, legendY, legendWidth, legendHeight, 8);
        ctx.fill();

        // Legend title
        ctx.fillStyle = this.app.isDarkMode ? '#f1f5f9' : '#111827';
        ctx.font = 'bold 12px Inter, sans-serif';
        ctx.fillText('Travel Time (minutes)', legendX + 10, legendY + 20);

        // Legend colors
        const colors = [
            { color: 'rgb(59, 130, 246)', label: '0-5' },
            { color: 'rgb(6, 182, 212)', label: '5-10' },
            { color: 'rgb(16, 185, 129)', label: '10-15' },
            { color: 'rgb(132, 204, 22)', label: '15-20' },
            { color: 'rgb(250, 204, 21)', label: '20-25' },
            { color: 'rgb(249, 115, 22)', label: '25-30' },
        ];

        const blockWidth = (legendWidth - 20) / colors.length;
        colors.forEach((c, i) => {
            ctx.fillStyle = c.color;
            ctx.fillRect(
                legendX + 10 + i * blockWidth,
                legendY + 30,
                blockWidth - 2,
                20
            );
        });

        // Legend labels
        ctx.fillStyle = this.app.isDarkMode ? '#94a3b8' : '#6b7280';
        ctx.font = '10px Inter, sans-serif';
        ctx.fillText('0', legendX + 10, legendY + 65);
        ctx.fillText('30m', legendX + legendWidth - 30, legendY + 65);

        // Attribution
        ctx.fillStyle = this.app.isDarkMode ? '#64748b' : '#9ca3af';
        ctx.font = '10px Inter, sans-serif';
        ctx.fillText(
            'Transit Topography',
            legendX + 10,
            legendY + legendHeight - 5
        );
    }

    /**
     * Trigger download of canvas as PNG
     * @private
     * @param {HTMLCanvasElement} canvas - Canvas to export
     */
    downloadImage(canvas) {
        const filename = this.generateFilename();
        const link = document.createElement('a');
        link.download = filename;
        link.href = canvas.toDataURL('image/png');
        link.click();
    }

    /**
     * Generate filename for export
     * @returns {string} Filename with city and timestamp
     */
    generateFilename() {
        const city = this.app.currentCity || 'map';
        const timestamp = Date.now();
        return `transit-topography-${city}-${timestamp}.png`;
    }
}

export default ExportManager;
