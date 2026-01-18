# Contributing to PaloChangeLogs

Thank you for your interest in contributing to PaloChangeLogs! This document provides guidelines and instructions for contributing.

## Getting Started

1. **Fork the Repository**: Create your own fork of the repository
2. **Clone Your Fork**: 
   ```bash
   git clone https://github.com/your-username/PaloChangeLogs.git
   cd PaloChangeLogs
   ```
3. **Create a Branch**: 
   ```bash
   git checkout -b feature/your-feature-name
   ```

## Development Setup

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Set Up Environment**:
   Create a `.env.local` file with your configuration:
   ```env
   VITE_PANORAMA_SERVER=https://panorama.example.com
   VITE_OIDC_ENABLED=false
   ```

3. **Start Development Server**:
   ```bash
   npm run dev
   ```

## Code Style Guidelines

### TypeScript

- Use TypeScript for all new code
- Avoid `any` types; use proper type definitions
- Define interfaces in `types.ts` for shared types
- Use meaningful variable and function names

### React

- Use functional components with hooks
- Prefer `const` over `let` when possible
- Use descriptive component and prop names
- Keep components focused and single-purpose

### Styling

- Use Tailwind CSS utility classes
- Follow existing design patterns
- Maintain consistent spacing and colors
- Ensure responsive design

### File Organization

- Keep components in `components/` directory
- Services in `services/` directory
- Utilities in `utils/` directory
- Types in `types.ts`

## Commit Guidelines

Write clear, descriptive commit messages:

```
feat: Add search functionality for change logs
fix: Resolve database query performance issue
docs: Update installation instructions
refactor: Simplify API proxy error handling
```

## Testing

Before submitting a pull request:

1. **Test Your Changes**: Ensure the application works as expected
2. **Check TypeScript**: Run `npm run build` to verify no type errors
3. **Test Different Scenarios**: Test with and without OIDC, different date ranges, etc.
4. **Check Browser Console**: Ensure no errors in browser console

## Pull Request Process

1. **Update Documentation**: If your changes affect user-facing features, update README.md
2. **Write Clear Description**: Explain what your PR does and why
3. **Reference Issues**: Link to any related issues
4. **Request Review**: Tag maintainers for review

## Areas for Contribution

- **Bug Fixes**: Fix reported issues
- **New Features**: Add requested features
- **Documentation**: Improve documentation
- **Performance**: Optimize database queries or API calls
- **UI/UX**: Improve user interface and experience
- **Testing**: Add automated tests

## Questions?

If you have questions about contributing:
- Open an issue for discussion
- Check existing issues and pull requests
- Review the codebase to understand patterns

Thank you for contributing to PaloChangeLogs!
