# Contributing to Transit Topography

Thank you for your interest in contributing to Transit Topography! This document provides guidelines and instructions for contributing to the project.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Code Style](#code-style)
- [Adding New Cities](#adding-new-cities)
- [Testing](#testing)
- [Submitting Changes](#submitting-changes)
- [Reporting Issues](#reporting-issues)

## Code of Conduct

Be respectful, inclusive, and professional. We welcome contributors from all backgrounds and experience levels.

## Getting Started

### Prerequisites

- **Git** - Version control
- **Node.js 14+** - For development tools
- **Python 3.8+** - For data generation scripts
- **Modern browser** - Chrome, Firefox, Safari, or Edge
- **LocationIQ API key** - Free at [locationiq.com](https://locationiq.com/)

### Initial Setup

1. **Fork and clone the repository**

```bash
git clone https://github.com/YOUR_USERNAME/Transit-Topography.git
cd Transit-Topography
```

2. **Install development dependencies**

```bash
npm install
```

3. **Install Python dependencies** (for data generation)

```bash
pip install -r requirements.txt
```

4. **Create config.js**

```bash
cp config.template.js config.js
```

Edit `config.js` and add your LocationIQ API key.

5. **Start local server**

```bash
npm start
```

Visit `http://localhost:8000` to see the app.

## Development Workflow

### Branch Strategy

- `main` - Stable production branch
- `feature/*` - New features
- `fix/*` - Bug fixes
- `docs/*` - Documentation updates
- `refactor/*` - Code refactoring

### Workflow Steps

1. **Create a new branch**

```bash
git checkout -b feature/your-feature-name
```

2. **Make your changes**

Follow the [Code Style](#code-style) guidelines below.

3. **Test your changes**

```bash
# Run linter
npm run lint

# Format code
npm run format

# Manual testing in browser
npm start
```

4. **Commit your changes**

Use clear, descriptive commit messages:

```bash
git commit -m "feat: Add support for real-time transit data"
git commit -m "fix: Resolve isochrone calculation bug for edge cases"
git commit -m "docs: Update README with new city addition instructions"
```

**Commit message format:**
- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation changes
- `style:` - Code style changes (formatting, etc.)
- `refactor:` - Code refactoring
- `perf:` - Performance improvements
- `test:` - Adding tests
- `chore:` - Maintenance tasks

5. **Push and create Pull Request**

```bash
git push origin feature/your-feature-name
```

Go to GitHub and create a Pull Request with a clear description.

## Code Style

### JavaScript

We use **ESLint** and **Prettier** to maintain consistent code style.

**Run before committing:**

```bash
npm run lint:fix
npm run format
```

**Key conventions:**
- Use **ES6+ features** (const/let, arrow functions, modules)
- Use **single quotes** for strings
- **4-space indentation**
- **Semicolons** required
- Use **camelCase** for variables and functions
- Use **PascalCase** for classes
- Use **UPPER_SNAKE_CASE** for constants
- Add **JSDoc comments** for public functions

**Example:**

```javascript
/**
 * Calculate travel time from origin to destination
 * @param {Object} origin - Origin coordinates
 * @param {Object} destination - Destination coordinates
 * @param {number} maxTime - Maximum travel time in minutes
 * @returns {number} Travel time in minutes, or Infinity if unreachable
 */
function calculateTravelTime(origin, destination, maxTime) {
    // Implementation
    return travelTime;
}
```

### HTML/CSS

- Use **semantic HTML5** elements
- Use **Tailwind CSS** utility classes where possible
- Custom CSS should go in `<style>` tags or separate CSS file
- Follow existing component patterns

### Python

- Follow **PEP 8** style guide
- Use **4-space indentation**
- Add **docstrings** to functions
- Use **type hints** where applicable

## Adding New Cities

### Step 1: Find GTFS Data

Locate an official GTFS feed for the transit agency. Good sources:
- Transit agency websites
- [TransitFeeds](https://transitfeeds.com/)
- [Mobility Database](https://database.mobilitydata.org/)

### Step 2: Add to Configuration

Edit `cities_config.json`:

```json
"city_code": {
  "name": "City Name",
  "gtfs_url": "https://example.com/gtfs.zip",
  "center": [latitude, longitude],
  "zoom": 12,
  "region": "north_america",
  "flag": "🇺🇸"
}
```

**Parameters:**
- `city_code` - Unique identifier (lowercase, underscores)
- `name` - Display name
- `gtfs_url` - URL to GTFS feed ZIP file
- `center` - [lat, lon] for initial map view
- `zoom` - Default zoom level (10-13 typical)
- `region` - One of: `north_america`, `europe`, `asia_pacific`, `south_america`
- `flag` - Country flag emoji
- `hidden` (optional) - Set to `true` to hide from selector

### Step 3: Generate Transit Data

```bash
python generate_city_data.py city_code
```

This creates `transit_data/city_code.json` with the transit graph.

### Step 4: Generate Walking Network (Recommended)

```bash
python generate_walking_network.py city_code
```

This creates `transit_data/walking_city_code.json` with street data.

### Step 5: Test

1. Reload the app
2. Select your new city
3. Verify data loads correctly
4. Test isochrone calculation
5. Check for console errors

### Step 6: Optimize (Optional)

If the walking network is large (>2MB):

```bash
python optimize_walking.py city_code
```

### Step 7: Submit Pull Request

Include in your PR description:
- City name and transit agency
- GTFS data source URL
- Screenshot of working isochrone
- Any special considerations

## Testing

### Manual Testing Checklist

When making changes, test the following:

- [ ] City selection and data loading
- [ ] Clicking map to set origin
- [ ] Address search (requires API key)
- [ ] Isochrone calculation and rendering
- [ ] Time slider adjustment
- [ ] Quality/resolution changes
- [ ] Bus toggle (if city has buses)
- [ ] Dark mode toggle
- [ ] Station and line overlays
- [ ] Right-click time query
- [ ] Export to PNG
- [ ] URL parameter sharing
- [ ] Mobile responsiveness
- [ ] Browser console (no errors)

### Browser Testing

Test in multiple browsers:
- Chrome/Chromium
- Firefox
- Safari (if on macOS)
- Edge

### Automated Testing

We're working on adding automated tests. For now, manual testing is required.

## Submitting Changes

### Pull Request Guidelines

**Before submitting:**
1. Run `npm run lint` - No errors
2. Run `npm run format` - Code is formatted
3. Test thoroughly in browser
4. Update documentation if needed
5. Add screenshots for visual changes

**PR Description should include:**
- What changed and why
- How to test the changes
- Screenshots (for UI changes)
- Breaking changes (if any)
- Related issues (if any)

**PR Title format:**
```
feat: Add Berlin transit data
fix: Resolve mobile layout issues
docs: Update contributing guidelines
```

### Review Process

1. Maintainer reviews code
2. Automated checks run (linting, etc.)
3. Discussion and feedback
4. Approval and merge

We aim to review PRs within 1 week.

## Reporting Issues

### Bug Reports

When reporting bugs, include:

1. **Description** - What happened vs. what should happen
2. **Steps to reproduce**
   - Which city
   - What actions you took
   - Settings used
3. **Environment**
   - Browser and version
   - Operating system
   - Screen size (for mobile issues)
4. **Screenshots** - If applicable
5. **Console errors** - Open DevTools → Console

**Example:**

```markdown
### Bug: Isochrone not rendering in Firefox

**Description:** When clicking the map in Firefox 120, the isochrone does not appear.

**Steps to reproduce:**
1. Open app in Firefox 120
2. Select "New York City"
3. Click anywhere on the map
4. Expected: Isochrone renders. Actual: Nothing happens.

**Environment:**
- Firefox 120.0
- macOS 14.1
- Console error: `ReferenceError: worker is not defined`

**Screenshot:** [attached]
```

### Feature Requests

When requesting features, include:

1. **Use case** - Why you need this feature
2. **Description** - What the feature should do
3. **Examples** - Similar features in other apps
4. **Alternatives** - Workarounds you've tried

## Questions?

- **General questions** - Open a GitHub Discussion
- **Bug reports** - Open a GitHub Issue
- **Security issues** - Email maintainer directly
- **Chat** - Join our community (if available)

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

---

**Thank you for contributing to Transit Topography!** 🚇🗺️
