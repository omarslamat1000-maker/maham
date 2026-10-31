/** هل يكتب المستخدم حاليًا في حقل إدخال؟ (لتجاهل اختصارات لوحة المفاتيح) */
export function isTyping(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
}
