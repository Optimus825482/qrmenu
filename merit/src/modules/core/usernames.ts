/** Builds the editable default login name from a full name (for example, Yiğit Avcı → yigit.avci). */
export function suggestedUsername(fullName: string): string {
  const parts = fullName
    .trim()
    .split(/\s+/)
    .map((part) => part
      .replace(/[ıİ]/g, "i")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^A-Za-z0-9]/g, "")
      .toLowerCase())
    .filter(Boolean);
  const name = (parts.join(".") || "kullanici").slice(0, 40).replace(/[._-]+$/, "");
  return name.length < 3 ? `${name}1`.slice(0, 40) : name;
}
