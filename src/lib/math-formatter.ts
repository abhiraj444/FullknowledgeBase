/**
 * Comprehensive LaTeX and Mathematical Expression Normalizer.
 * Converts LaTeX math expressions, symbols, integrals, equations, and notation
 * into clean, high-fidelity Unicode plain text suitable for PDF and PPTX documents.
 */

// Mapping of common superscripts to Unicode
const SUPERSCRIPT_MAP: Record<string, string> = {
  '0': '⁰',
  '1': '¹',
  '2': '²',
  '3': '³',
  '4': '⁴',
  '5': '⁵',
  '6': '⁶',
  '7': '⁷',
  '8': '⁸',
  '9': '⁹',
  '+': '⁺',
  '-': '⁻',
  '=': '⁼',
  '(': '⁽',
  ')': '⁾',
  'n': 'ⁿ',
  'i': 'ⁱ',
  'x': 'ˣ',
  'y': 'ʸ',
  'a': 'ᵃ',
  'b': 'ᵇ',
  'c': 'ᶜ',
  'd': 'ᵈ',
  'e': 'ᵉ',
  'k': 'ᵏ',
  'm': 'ᵐ',
  'p': 'ᵖ',
  'r': 'ʳ',
  's': 'ˢ',
  't': 'ᵗ',
};

// Mapping of common subscripts to Unicode
const SUBSCRIPT_MAP: Record<string, string> = {
  '0': '₀',
  '1': '₁',
  '2': '₂',
  '3': '₃',
  '4': '₄',
  '5': '₅',
  '6': '₆',
  '7': '₇',
  '8': '₈',
  '9': '₉',
  '+': '₊',
  '-': '₋',
  '=': '₌',
  '(': '₍',
  ')': '₎',
  'a': 'ₐ',
  'e': 'ₑ',
  'h': 'ₕ',
  'i': 'ᵢ',
  'j': 'ⱼ',
  'k': 'ₖ',
  'l': 'ₗ',
  'm': 'ₘ',
  'n': 'ₙ',
  'o': 'ₒ',
  'p': 'ₚ',
  'r': 'ᵣ',
  's': 'ₛ',
  't': 'ₜ',
  'u': 'ᵤ',
  'v': 'ᵥ',
  'x': 'ₓ',
};

/**
 * Converts a small string of characters into superscript Unicode if possible.
 */
function toSuperscript(str: string): string {
  if (!str) return '';
  const trimmed = str.trim();
  let result = '';
  for (const ch of trimmed) {
    if (SUPERSCRIPT_MAP[ch]) {
      result += SUPERSCRIPT_MAP[ch];
    } else {
      // If any character cannot be converted to Unicode superscript, fallback to ^(...)
      return `^(${trimmed})`;
    }
  }
  return result;
}

/**
 * Converts a small string of characters into subscript Unicode if possible.
 */
function toSubscript(str: string): string {
  if (!str) return '';
  const trimmed = str.trim();
  let result = '';
  for (const ch of trimmed) {
    if (SUBSCRIPT_MAP[ch]) {
      result += SUBSCRIPT_MAP[ch];
    } else {
      // If any character cannot be converted to Unicode subscript, fallback to _(...)
      return `_(${trimmed})`;
    }
  }
  return result;
}

/**
 * Resolves nested or chained \frac{A}{B} expressions into (A) / (B).
 */
function resolveFractions(text: string): string {
  let result = text;
  const fracRegex = /\\frac\s*\{([^{}]+)\}\s*\{([^{}]+)\}/g;
  let iterations = 0;
  while (fracRegex.test(result) && iterations < 8) {
    result = result.replace(fracRegex, '($1 / $2)');
    iterations++;
  }
  return result;
}

/**
 * Resolves square roots \sqrt[n]{x} and \sqrt{x}.
 */
function resolveRoots(text: string): string {
  let result = text;
  // Nth root: \sqrt[3]{x} -> ³√(x)
  result = result.replace(/\\sqrt\s*\[(.*?)\]\s*\{([^{}]+)\}/g, (_, n, inner) => {
    const supN = toSuperscript(n);
    return `${supN}√(${inner.trim()})`;
  });
  // Square root: \sqrt{x} -> √(x)
  result = result.replace(/\\sqrt\s*\{([^{}]+)\}/g, '√($1)');
  return result;
}

/**
 * Normalizes calculus integrals, sums, products, and limits.
 */
function resolveCalculusAndBounds(text: string): string {
  let res = text;

  // 1. Definite Integrals with both bounds:
  // e.g., \int_{0}^{1}, \int_{a}^{b}, \int_{-\infty}^{\infty}
  res = res.replace(
    /\\(?:int|smallint)\s*(?:_\{([^{}]+)\}|_([a-zA-Z0-9\-\+\\]+))\s*(?:\^\{([^{}]+)\}|\^([a-zA-Z0-9\-\+\\]+))/g,
    (_, sub1, sub2, sup1, sup2) => {
      const lower = (sub1 || sub2 || '').replace(/\\infty/g, '∞').trim();
      const upper = (sup1 || sup2 || '').replace(/\\infty/g, '∞').trim();
      return `∫[${lower} to ${upper}] `;
    }
  );

  // Inverted order: \int^{b}_{a}
  res = res.replace(
    /\\(?:int|smallint)\s*(?:\^\{([^{}]+)\}|\^([a-zA-Z0-9\-\+\\]+))\s*(?:_\{([^{}]+)\}|_([a-zA-Z0-9\-\+\\]+))/g,
    (_, sup1, sup2, sub1, sub2) => {
      const upper = (sup1 || sup2 || '').replace(/\\infty/g, '∞').trim();
      const lower = (sub1 || sub2 || '').replace(/\\infty/g, '∞').trim();
      return `∫[${lower} to ${upper}] `;
    }
  );

  // Indefinite/Single bound Integral: \int_{C}, \int_{0}
  res = res.replace(/\\(?:int|smallint)\s*(?:_\{([^{}]+)\}|_([a-zA-Z0-9\-\+\\]+))/g, (_, sub1, sub2) => {
    const lower = (sub1 || sub2 || '').replace(/\\infty/g, '∞').trim();
    return `∫[${lower}] `;
  });

  // Multiple Integrals
  res = res.replace(/\\iiint\b/g, '∭ ');
  res = res.replace(/\\iint\b/g, '∬ ');
  res = res.replace(/\\oint\b/g, '∮ ');
  res = res.replace(/\\int\b|\\smallint\b/g, '∫ ');

  // 2. Sums with bounds: \sum_{i=1}^{n}, \sum_{i=1}^{\infty}
  res = res.replace(
    /\\sum\s*(?:_\{([^{}]+)\}|_([a-zA-Z0-9\-\+\\]+))\s*(?:\^\{([^{}]+)\}|\^([a-zA-Z0-9\-\+\\]+))/g,
    (_, sub1, sub2, sup1, sup2) => {
      const lower = (sub1 || sub2 || '').replace(/\\infty/g, '∞').trim();
      const upper = (sup1 || sup2 || '').replace(/\\infty/g, '∞').trim();
      return `∑[${lower} to ${upper}] `;
    }
  );
  res = res.replace(/\\sum\s*(?:_\{([^{}]+)\}|_([a-zA-Z0-9\-\+\\]+))/g, (_, sub1, sub2) => {
    const lower = (sub1 || sub2 || '').replace(/\\infty/g, '∞').trim();
    return `∑[${lower}] `;
  });
  res = res.replace(/\\sum\b/g, '∑ ');

  // 3. Products with bounds: \prod_{i=1}^{n}
  res = res.replace(
    /\\prod\s*(?:_\{([^{}]+)\}|_([a-zA-Z0-9\-\+\\]+))\s*(?:\^\{([^{}]+)\}|\^([a-zA-Z0-9\-\+\\]+))/g,
    (_, sub1, sub2, sup1, sup2) => {
      const lower = (sub1 || sub2 || '').replace(/\\infty/g, '∞').trim();
      const upper = (sup1 || sup2 || '').replace(/\\infty/g, '∞').trim();
      return `∏[${lower} to ${upper}] `;
    }
  );
  res = res.replace(/\\prod\b/g, '∏ ');

  // 4. Limits: \lim_{x \to 0}, \lim_{t \to \infty}
  res = res.replace(
    /\\lim\s*(?:_\{([^{}]+)\}|_([a-zA-Z0-9\-\+\\]+))/g,
    (_, sub1, sub2) => {
      let sub = (sub1 || sub2 || '')
        .replace(/\\to\b|\\rightarrow\b/g, '→')
        .replace(/\\infty\b/g, '∞')
        .trim();
      return `lim(${sub}) `;
    }
  );
  res = res.replace(/\\lim\b/g, 'lim ');

  return res;
}

/**
 * Formats all LaTeX math, symbols, and formatting into clean Unicode text.
 * Works seamlessly across both PDF exports (jsPDF) and PowerPoint (pptxgenjs).
 */
export function formatMathAndLatexForExport(input: string): string {
  if (!input) return '';

  let text = input;

  // 1. Remove HTML tags if present
  text = text
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?[^>]+(>|$)/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"');

  // 2. Unwrap display math $$ ... $$ and \[ ... \]
  text = text.replace(/\$\$\s*([\s\S]*?)\s*\$\$/g, ' $1 ');
  text = text.replace(/\\\[\s*([\s\S]*?)\s*\\\]/g, ' $1 ');

  // 3. Unwrap inline math $ ... $ and \( ... \)
  text = text.replace(/\$([^\$\n]+?)\$/g, ' $1 ');
  text = text.replace(/\\\(\s*([\s\S]*?)\s*\\\)/g, ' $1 ');

  // 4. Resolve fractions and roots
  text = resolveFractions(text);
  text = resolveRoots(text);

  // 5. Resolve integrals, sums, products, and limits
  text = resolveCalculusAndBounds(text);

  // 6. LaTeX text and font containers
  text = text
    .replace(/\\(?:text|mathrm|mathbf|textbf|mathit|boldsymbol|operatorname)\s*\{([^}]+)\}/g, '$1')
    .replace(/\\(?:mathbb|mathcal|mathscr|mathfrak)\s*\{([^}]+)\}/g, '$1');

  // 7. Bracket resizing modifiers
  text = text
    .replace(/\\left\s*\(/g, '(')
    .replace(/\\right\s*\)/g, ')')
    .replace(/\\left\s*\[/g, '[')
    .replace(/\\right\s*\]/g, ']')
    .replace(/\\left\s*\\\{/g, '{')
    .replace(/\\right\s*\\\}/g, '}')
    .replace(/\\left\s*\|/g, '|')
    .replace(/\\right\s*\|/g, '|')
    .replace(/\\left\s*\./g, '')
    .replace(/\\right\s*\./g, '');

  // 8. Superscripts and Exponents:
  // e.g., x^{2} -> x², e^{-x} -> e⁻ˣ, 10^{6} -> 10⁶
  text = text.replace(/\^\{([^{}]+)\}/g, (_, exp) => toSuperscript(exp));
  text = text.replace(/\^([0-9\+\-nixyab])/g, (_, exp) => toSuperscript(exp));

  // 9. Subscripts:
  // e.g., x_{1} -> x₁, x_{i} -> xᵢ, x_{max} -> x_max
  text = text.replace(/_\{([^{}]+)\}/g, (_, sub) => {
    const converted = toSubscript(sub);
    return converted.startsWith('_(') ? `_${sub}` : converted;
  });
  text = text.replace(/_([0-9a-z])/g, (_, sub) => toSubscript(sub));

  // 10. Greek Letters (Lowercase & Uppercase)
  text = text
    .replace(/\\alpha\b/g, 'α')
    .replace(/\\beta\b/g, 'β')
    .replace(/\\gamma\b/g, 'γ')
    .replace(/\\Gamma\b/g, 'Γ')
    .replace(/\\delta\b/g, 'δ')
    .replace(/\\Delta\b/g, 'Δ')
    .replace(/\\epsilon\b|\\varepsilon\b/g, 'ε')
    .replace(/\\zeta\b/g, 'ζ')
    .replace(/\\eta\b/g, 'η')
    .replace(/\\theta\b|\\vartheta\b/g, 'θ')
    .replace(/\\Theta\b/g, 'Θ')
    .replace(/\\iota\b/g, 'ι')
    .replace(/\\kappa\b/g, 'κ')
    .replace(/\\lambda\b/g, 'λ')
    .replace(/\\Lambda\b/g, 'Λ')
    .replace(/\\mu\b/g, 'μ')
    .replace(/\\nu\b/g, 'ν')
    .replace(/\\xi\b/g, 'ξ')
    .replace(/\\Xi\b/g, 'Ξ')
    .replace(/\\pi\b|\\varpi\b/g, 'π')
    .replace(/\\Pi\b/g, 'Π')
    .replace(/\\rho\b|\\varrho\b/g, 'ρ')
    .replace(/\\sigma\b/g, 'σ')
    .replace(/\\Sigma\b/g, 'Σ')
    .replace(/\\tau\b/g, 'τ')
    .replace(/\\upsilon\b/g, 'υ')
    .replace(/\\Upsilon\b/g, 'Υ')
    .replace(/\\phi\b|\\varphi\b/g, 'φ')
    .replace(/\\Phi\b/g, 'Φ')
    .replace(/\\chi\b/g, 'χ')
    .replace(/\\psi\b/g, 'ψ')
    .replace(/\\Psi\b/g, 'Ψ')
    .replace(/\\omega\b/g, 'ω')
    .replace(/\\Omega\b/g, 'Ω');

  // 11. Mathematical Operators & Relations
  text = text
    .replace(/\\pm\b/g, '±')
    .replace(/\\mp\b/g, '∓')
    .replace(/\\times\b/g, '×')
    .replace(/\\cdot\b/g, '·')
    .replace(/\\div\b/g, '÷')
    .replace(/\\leq?\b|\\le\b/g, '≤')
    .replace(/\\geq?\b|\\ge\b/g, '≥')
    .replace(/\\neq?\b|\\ne\b/g, '≠')
    .replace(/\\approx\b/g, '≈')
    .replace(/\\equiv\b/g, '≡')
    .replace(/\\sim\b/g, '∼')
    .replace(/\\propto\b/g, '∝')
    .replace(/\\infty\b/g, '∞')
    .replace(/\\partial\b/g, '∂')
    .replace(/\\nabla\b/g, '∇')
    .replace(/\\degree\b|\\circ\b/g, '°')
    .replace(/\\forall\b/g, '∀')
    .replace(/\\exists\b/g, '∃')
    .replace(/\\in\b/g, '∈')
    .replace(/\\notin\b/g, '∉')
    .replace(/\\subset\b/g, '⊂')
    .replace(/\\subseteq\b/g, '⊆')
    .replace(/\\supset\b/g, '⊃')
    .replace(/\\supseteq\b/g, '⊇')
    .replace(/\\cup\b/g, '∪')
    .replace(/\\cap\b/g, '∩')
    .replace(/\\vee\b/g, '∨')
    .replace(/\\wedge\b/g, '∧')
    .replace(/\\oplus\b/g, '⊕')
    .replace(/\\otimes\b/g, '⊗')
    .replace(/\\odot\b/g, '☉');

  // 12. Arrows & Logic
  text = text
    .replace(/\\rightarrow\b|\\to\b/g, '→')
    .replace(/\\leftarrow\b/g, '←')
    .replace(/\\uparrow\b/g, '↑')
    .replace(/\\downarrow\b/g, '↓')
    .replace(/\\leftrightarrow\b/g, '↔')
    .replace(/\\Rightarrow\b|\\implies\b/g, '⇒')
    .replace(/\\Leftarrow\b/g, '⇐')
    .replace(/\\Leftrightarrow\b|\\iff\b/g, '⇔');

  // 13. Standard Math Function Names: strip leading slash cleanly
  text = text
    .replace(/\\(?:sin|cos|tan|sec|csc|cot|arcsin|arccos|arctan|sinh|cosh|tanh)\b/g, (m) => m.slice(1))
    .replace(/\\(?:ln|log|exp|det|dim|ker|deg|max|min|sup|inf|arg)\b/g, (m) => m.slice(1));

  // 14. Spacing and LaTeX formatting tokens
  text = text
    .replace(/\\(?:quad|qquad)\b/g, '  ')
    .replace(/\\(?:,|;|:|!)/g, ' ')
    .replace(/\\(?:displaystyle|textstyle|scriptstyle|scriptscriptstyle)\b/g, '')
    .replace(/\\(?:limits|nolimits)\b/g, '');

  // 15. Markdown formatting: bold, italic, inline code, links
  text = text
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');

  // 16. Cleanup any leftover raw backslashes preceding words
  text = text.replace(/\\([a-zA-Z]+)/g, '$1');

  // 17. Clean whitespace
  text = text.replace(/[ \t]+/g, ' ').trim();

  return text;
}
