# Contributing to Manuscript Calendar

Thank you for your interest in contributing to the Manuscript Calendar plugin for Obsidian.md!

## Development Guidelines

### Obsidian API and DOM Manipulation

1. **Use the Obsidian API**: Always prefer using the Obsidian API methods when available instead of direct DOM manipulation.

2. **DOM Manipulation Best Practices**:
   - Use proper DOM methods like `document.createElement()`, `element.appendChild()`, `element.setAttribute()`, etc.
   - **AVOID** using `innerHTML`, `outerHTML`, or directly inserting HTML strings as they pose security risks.
   - **DO NOT** use `element.innerHTML = ...` or similar HTML string insertion methods.
   - Create elements using the DOM API and compose them programmatically.

3. **Event Handling**:
   - Use proper event listeners with `addEventListener()` instead of inline event handlers.
   - Remember to remove event listeners when components are unloaded to prevent memory leaks.

### Code Style and Structure

1. **TypeScript**: This project uses TypeScript. Ensure proper typing for all variables, functions, and components.

2. **Modular Code**: Keep code modular and maintainable. Break down complex functionalities into smaller, reusable components.

3. **Comments and Documentation**: Document your code with appropriate comments, especially for complex logic.

4. **Error Handling**: Implement proper error handling to ensure the plugin remains stable even in edge cases.

### Testing

1. **Testing**: Test your changes thoroughly before submitting a pull request.
   - Test across different operating systems if possible.
   - Test with different Obsidian themes to ensure visual consistency.

### Pull Request Process

1. Fork the repository and create a new branch for your feature or bugfix.
2. Ensure your code adheres to the guidelines mentioned above.
3. Update documentation if necessary.
4. Submit a pull request with a clear description of the changes.

## Development Setup

1. Clone the repository
2. Install dependencies with `npm install`
3. Use `npm run dev` for development with hot reloading
4. Use `npm run build` to create a production build

## Example: Proper DOM Creation

```typescript
// GOOD: Create elements using DOM API
const calendarContainer = document.createElement('div');
calendarContainer.addClass('calendar-container');

const dateElement = document.createElement('span');
dateElement.textContent = date.toString();
dateElement.addClass('calendar-date');

calendarContainer.appendChild(dateElement);

// BAD: Do not do this!
// container.innerHTML = '<div class="calendar-container"><span class="calendar-date">' + date + '</span></div>';
```

Thank you for following these guidelines and contributing to the project! 