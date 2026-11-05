// Links for sharing a message (src/components/ui/share-menu.tsx).

/**
 * The WhatsApp link that opens with the words filled in: to one Indian mobile number
 * when given ("98765 43210", "+91 98765 43210"), else WhatsApp asks which chat.
 */
export function whatsappHref(text: string, phone?: string | null): string {
  const digits = (phone ?? "").replace(/\D/g, "").replace(/^0+/, "");
  const to = digits.length === 10 ? `91${digits}` : digits.length === 12 && digits.startsWith("91") ? digits : "";
  return `https://wa.me/${to}?text=${encodeURIComponent(text)}`;
}
