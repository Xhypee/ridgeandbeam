// Torn bottom edge of a receipt (the zig-zag under the quote), as a CSS clip-path.
export const TORN = (() => {
  const p = ["0 0", "100% 0", "100% calc(100% - 10px)"];
  for (let x = 96; x > 0; x -= 4) p.push(`${x}% ${(100 - x) % 8 === 4 ? "100%" : "calc(100% - 10px)"}`);
  p.push("0 calc(100% - 10px)");
  return `polygon(${p.join(",")})`;
})();
