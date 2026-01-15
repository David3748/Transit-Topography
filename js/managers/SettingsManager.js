/**
 * SettingsManager - Manages application settings, URL parameters, and state persistence
 * Extracted from app.js as part of Phase 1 refactoring
 */

import { getUrlParams, updateUrl } from '../utils.js';

export class SettingsManager {
    /**
     * @param {Object} app - Reference to main app instance
     */
    constructor(app) {
        this.app = app;
        this.settings = {
            city: null,
            lat: null,
            lon: null,
            time: 30,
            quality: 2,
            opacity: 0.6,
            isDarkMode: false,
            showStations: false,
            showLines: false,
            walkingEnabled: true,
            buses: false,
            theme: 'light',
        };
    }

    /**
     * Initialize settings from URL parameters
     * @returns {Object} Parsed URL parameters
     */
    loadFromURL() {
        const params = getUrlParams();

        if (params.city) this.settings.city = params.city;
        if (params.lat) this.settings.lat = parseFloat(params.lat);
        if (params.lon) this.settings.lon = parseFloat(params.lon);
        if (params.time) this.settings.time = parseInt(params.time);
        if (params.quality) this.settings.quality = parseInt(params.quality);
        if (params.opacity) this.settings.opacity = parseFloat(params.opacity);
        if (params.theme) {
            this.settings.theme = params.theme;
            this.settings.isDarkMode = params.theme === 'dark';
        }

        return params;
    }

    /**
     * Get a setting value
     * @param {string} key - Setting key
     * @returns {any} Setting value
     */
    get(key) {
        return this.settings[key];
    }

    /**
     * Set a setting value
     * @param {string} key - Setting key
     * @param {any} value - Setting value
     */
    set(key, value) {
        this.settings[key] = value;
        this.saveToURL();
    }

    /**
     * Update URL with current settings
     */
    saveToURL() {
        const params = {
            city: this.settings.city,
        };

        if (this.settings.lat && this.settings.lon) {
            params.lat = this.settings.lat.toFixed(6);
            params.lon = this.settings.lon.toFixed(6);
        }

        if (this.settings.time !== 30) {
            params.time = this.settings.time;
        }

        if (this.settings.quality !== 2) {
            params.quality = this.settings.quality;
        }

        if (this.settings.theme) {
            params.theme = this.settings.theme;
        }

        updateUrl(params);
    }

    /**
     * Toggle dark mode theme
     */
    toggleDarkMode() {
        this.settings.isDarkMode = !this.settings.isDarkMode;
        const theme = this.settings.isDarkMode ? 'dark' : 'light';
        this.settings.theme = theme;

        // Update document theme
        document.documentElement.setAttribute('data-theme', theme);

        // Update button aria-pressed state
        const themeBtn = document.getElementById('theme-btn');
        if (themeBtn) {
            themeBtn.setAttribute(
                'aria-pressed',
                this.settings.isDarkMode.toString()
            );
        }

        // Update icon visibility
        const lightIcon = document.getElementById('theme-icon-light');
        const darkIcon = document.getElementById('theme-icon-dark');
        if (lightIcon && darkIcon) {
            if (this.settings.isDarkMode) {
                lightIcon.classList.add('hidden');
                darkIcon.classList.remove('hidden');
            } else {
                lightIcon.classList.remove('hidden');
                darkIcon.classList.add('hidden');
            }
        }

        // Update URL
        this.saveToURL();

        return this.settings.isDarkMode;
    }

    /**
     * Generate shareable URL for current state
     * @returns {string} Full URL with current parameters
     */
    generateShareURL() {
        this.saveToURL();
        return window.location.href;
    }

    /**
     * Get all current settings
     * @returns {Object} Settings object
     */
    getAll() {
        return { ...this.settings };
    }

    /**
     * Update settings from UI controls
     */
    syncFromUI() {
        const timeSelect = document.getElementById('max-time-select');
        if (timeSelect) {
            this.settings.time = parseInt(timeSelect.value);
        }

        const resSelect = document.getElementById('res-select');
        if (resSelect) {
            this.settings.quality = parseInt(resSelect.value);
        }

        const opacitySlider = document.getElementById('opacity-slider');
        if (opacitySlider) {
            this.settings.opacity = parseFloat(opacitySlider.value);
        }

        const busToggle = document.getElementById('bus-toggle');
        if (busToggle) {
            this.settings.buses = busToggle.checked;
        }

        const walkingToggle = document.getElementById(
            'walking-network-toggle'
        );
        if (walkingToggle) {
            this.settings.walkingEnabled = walkingToggle.checked;
        }
    }
}

export default SettingsManager;
