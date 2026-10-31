import { useEffect, useMemo, useState } from 'react';
import {
  Download,
  ExternalLink,
  Eye,
  File as FileIcon,
  FileCode,
  FileSpreadsheet,
  FileText,
  History,
  Image as ImageIcon,
  Link2,
  MoreVertical,
  Package,
  Pencil,
  Presentation,
  Star,
  Trash2,
  Upload,
  Video,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/form';
import { Badge, EmptyState, LoadingBlock, type Tone } from '@/components/ui/misc';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/overlay';
import { useAction, useDeliverables, useDeliverableVersions, useLookups, useSettings } from '@/hooks/data';
import { confirmDialog } from '@/stores/uiStore';
import { deliverableService, type DeliverableSource } from '@/services/deliverableService';
import { DELIVERABLE_APPROVALS, DELIVERABLE_KINDS, type Deliverable, type DeliverableKind, type DeliverableVersion, type Task } from '@/types/entities';
import { DELIVERABLE_APPROVAL_LABEL, DELIVERABLE_KIND_LABEL } from '@/utils/labels';
import { ACCEPT_ATTR, canPreviewInline, checkFile, downloadBlob, formatBytes } from '@/utils/file';
import { formatDateTime } from '@/utils/date';

const KIND_ICON: Record<DeliverableKind, typeof FileIcon> = {
  word: FileText,
  powerpoint: Presentation,
  excel: FileSpreadsheet,
  pdf: FileText,
  html: FileCode,
  image: ImageIcon,
  video_link: Video,
  link: Link2,
  other: FileIcon,
};

const APPROVAL_TONE: Record<Deliverable['approvalStatus'], Tone> = { pending: 'info', approved: 'success', rejected: 'danger' };
const isLinkKind = (k: DeliverableKind) => k === 'video_link' || k === 'link';

async function downloadVersion(v: DeliverableVersion) {
  if (v.externalUrl) {
    window.open(v.externalUrl, '_blank', 'noopener,noreferrer');
    return;
  }
  if (!v.blobId) return;
  const blob = await deliverableService.getBlob(v.blobId);
  if (!blob) {
    toast.error('الملف غير متوفر على هذا الجهاز (ربما استُوردت النسخة دون مرفقات)');
    return;
  }
  downloadBlob(blob, v.fileName ?? 'file');
}

function useObjectUrl(blobId: string | null | undefined, enabled: boolean) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled || !blobId) return;
    let u: string | null = null;
    let cancelled = false;
    deliverableService.getBlob(blobId).then((b) => {
      if (cancelled || !b) return;
      u = URL.createObjectURL(b);
      setUrl(u);
    });
    return () => {
      cancelled = true;
      if (u) URL.revokeObjectURL(u);
      setUrl(null);
    };
  }, [blobId, enabled]);
  return url;
}

export function DeliverablesTab({ task }: { task: Task }) {
  const deliverables = useDeliverables(task.id);
  const versions = useDeliverableVersions(task.id);
  const [adding, setAdding] = useState(false);
  const [replacing, setReplacing] = useState<Deliverable | null>(null);
  const [history, setHistory] = useState<Deliverable | null>(null);
  const [editing, setEditing] = useState<Deliverable | null>(null);
  const [preview, setPreview] = useState<DeliverableVersion | null>(null);
  const { run } = useAction();
  const { userName } = useLookups();

  const currentVersion = useMemo(() => new Map((versions ?? []).map((v) => [v.id, v])), [versions]);

  if (!deliverables || !versions) return <LoadingBlock />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          الملفات تُحفظ داخل متصفح هذا الجهاز. للفيديو والملفات الكبيرة أضف رابطًا خارجيًا.
        </p>
        <Button onClick={() => setAdding(true)}>
          <Upload aria-hidden />
          إضافة مخرج
        </Button>
      </div>

      {deliverables.length === 0 ? (
        <EmptyState icon={Package} title="لا توجد مخرجات" description="ارفع ملفات Word أو PowerPoint أو Excel أو PDF أو صورًا، أو أضف روابط فيديو." />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {deliverables.map((d) => {
            const v = d.currentVersionId ? currentVersion.get(d.currentVersionId) : undefined;
            const Icon = KIND_ICON[d.kind];
            const previewable = !!v && !v.externalUrl && canPreviewInline(v.mimeType, v.fileName);
            return (
              <li key={d.id} className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
                <div className="flex items-start gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
                    <Icon className="size-5" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{d.name}</p>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      <Badge>{DELIVERABLE_KIND_LABEL[d.kind]}</Badge>
                      <Badge tone="secondary" className="tabular">
                        الإصدار {d.version}
                      </Badge>
                      <Badge tone={APPROVAL_TONE[d.approvalStatus]}>{DELIVERABLE_APPROVAL_LABEL[d.approvalStatus]}</Badge>
                      {d.isFinal && (
                        <Badge tone="warning">
                          <Star aria-hidden />
                          نهائي
                        </Badge>
                      )}
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon-sm" aria-label={`خيارات ${d.name}`}>
                        <MoreVertical />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      <DropdownMenuItem onSelect={() => setReplacing(d)}>
                        <Upload />
                        رفع إصدار جديد (استبدال)
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => setHistory(d)}>
                        <History />
                        سجل الإصدارات
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => setEditing(d)}>
                        <Pencil />
                        تعديل البيانات
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => run(() => deliverableService.setFinal(d.id, !d.isFinal))}>
                        <Star />
                        {d.isFinal ? 'إلغاء كمخرج نهائي' : 'تحديد كمخرج نهائي'}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        destructive
                        onSelect={async () => {
                          if (
                            await confirmDialog({
                              title: 'حذف المخرج؟',
                              description: `سيُحذف «${d.name}» وجميع إصداراته وملفاته نهائيًا من هذا الجهاز.`,
                              destructive: true,
                              confirmText: 'حذف نهائي',
                            })
                          )
                            await run(() => deliverableService.remove(d.id), 'تم حذف المخرج');
                        }}
                      >
                        <Trash2 />
                        حذف
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                {d.description && <p className="text-sm text-muted-foreground">{d.description}</p>}
                {v && (
                  <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <dt>{v.externalUrl ? 'الرابط' : 'الملف'}</dt>
                    <dd className="truncate text-foreground" dir="ltr" title={v.externalUrl ?? v.fileName ?? ''}>
                      {v.externalUrl ?? v.fileName}
                    </dd>
                    {!v.externalUrl && (
                      <>
                        <dt>الحجم</dt>
                        <dd className="tabular text-foreground">{formatBytes(v.size)}</dd>
                      </>
                    )}
                    <dt>تاريخ الرفع</dt>
                    <dd className="text-foreground">{formatDateTime(v.createdAt)}</dd>
                    <dt>بواسطة</dt>
                    <dd className="text-foreground">{userName(v.createdBy)}</dd>
                  </dl>
                )}
                <div className="mt-auto flex flex-wrap items-center gap-2">
                  {v && (
                    <Button size="sm" variant="outline" onClick={() => downloadVersion(v)}>
                      {v.externalUrl ? <ExternalLink aria-hidden /> : <Download aria-hidden />}
                      {v.externalUrl ? 'فتح الرابط' : 'تنزيل'}
                    </Button>
                  )}
                  {previewable && (
                    <Button size="sm" variant="ghost" onClick={() => setPreview(v!)}>
                      <Eye aria-hidden />
                      معاينة
                    </Button>
                  )}
                  <Select
                    aria-label="حالة اعتماد المخرج"
                    value={d.approvalStatus}
                    onChange={(e) => run(() => deliverableService.setApproval(d.id, e.target.value as Deliverable['approvalStatus']))}
                    className="ms-auto h-8 w-32 text-xs"
                  >
                    {DELIVERABLE_APPROVALS.map((a) => (
                      <option key={a} value={a}>
                        {DELIVERABLE_APPROVAL_LABEL[a]}
                      </option>
                    ))}
                  </Select>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <AddDeliverableDialog task={task} open={adding} onClose={() => setAdding(false)} />
      <ReplaceDialog deliverable={replacing} onClose={() => setReplacing(null)} />
      <HistoryDialog deliverable={history} onClose={() => setHistory(null)} />
      <EditDialog deliverable={editing} onClose={() => setEditing(null)} />
      <PreviewDialog version={preview} onClose={() => setPreview(null)} />
    </div>
  );
}

function SourcePicker({ kind, onChange }: { kind: DeliverableKind; onChange: (s: DeliverableSource | null) => void }) {
  const settings = useSettings();
  const [mode, setMode] = useState<'file' | 'url'>(isLinkKind(kind) ? 'url' : 'file');
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setMode(isLinkKind(kind) ? 'url' : 'file');
    onChange(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);
  return (
    <div className="space-y-2 sm:col-span-2">
      {!isLinkKind(kind) && (
        <div className="flex gap-4 text-sm" role="radiogroup" aria-label="مصدر المخرج">
          <label className="flex items-center gap-1.5">
            <input type="radio" checked={mode === 'file'} onChange={() => (setMode('file'), onChange(null))} className="accent-[var(--primary)]" />
            رفع ملف
          </label>
          <label className="flex items-center gap-1.5">
            <input type="radio" checked={mode === 'url'} onChange={() => (setMode('url'), onChange(null))} className="accent-[var(--primary)]" />
            رابط خارجي
          </label>
        </div>
      )}
      {mode === 'file' ? (
        <Field label="الملف" htmlFor="dl-file" error={error ?? undefined} hint={`الحد الأقصى ${settings?.maxFileSizeMb ?? 25} ميغابايت`}>
          <input
            id="dl-file"
            type="file"
            accept={ACCEPT_ATTR}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (!f) return onChange(null);
              const c = checkFile(f, settings?.maxFileSizeMb ?? 25);
              setError(c.ok ? null : c.error);
              onChange(c.ok ? { file: f } : null);
            }}
            className="text-sm file:me-3 file:rounded-lg file:border-0 file:bg-muted file:px-3 file:py-2 file:text-sm"
          />
        </Field>
      ) : (
        <Field label="الرابط" htmlFor="dl-url" hint="روابط https فقط (يوتيوب، Drive، OneDrive…)">
          <Input id="dl-url" dir="ltr" type="url" placeholder="https://" onChange={(e) => onChange(e.target.value.trim() ? { url: e.target.value.trim() } : null)} />
        </Field>
      )}
    </div>
  );
}

function AddDeliverableDialog({ task, open, onClose }: { task: Task; open: boolean; onClose: () => void }) {
  const { run, pending } = useAction();
  const [name, setName] = useState('');
  const [kind, setKind] = useState<DeliverableKind>('pdf');
  const [description, setDescription] = useState('');
  const [isFinal, setIsFinal] = useState(false);
  const [source, setSource] = useState<DeliverableSource | null>(null);
  useEffect(() => {
    if (open) {
      setName('');
      setKind('pdf');
      setDescription('');
      setIsFinal(false);
      setSource(null);
    }
  }, [open]);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!source) return toast.error('اختر ملفًا أو أدخل رابطًا');
    const r = await run(() => deliverableService.create(task.id, { name: name || ('file' in source ? source.file.name : 'رابط'), kind, description, isFinal }, source), 'تمت إضافة المخرج');
    if (r) onClose();
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="إضافة مخرج" wide>
        <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
          <Field label="اسم المخرج" htmlFor="dl-name">
            <Input id="dl-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="يُستخدم اسم الملف إن تُرك فارغًا" />
          </Field>
          <Field label="النوع" htmlFor="dl-kind">
            <Select id="dl-kind" value={kind} onChange={(e) => setKind(e.target.value as DeliverableKind)}>
              {DELIVERABLE_KINDS.map((k) => (
                <option key={k} value={k}>
                  {DELIVERABLE_KIND_LABEL[k]}
                </option>
              ))}
            </Select>
          </Field>
          <SourcePicker kind={kind} onChange={setSource} />
          <Field label="الوصف" htmlFor="dl-desc" className="sm:col-span-2">
            <Textarea id="dl-desc" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <Checkbox checked={isFinal} onChange={(e) => setIsFinal(e.target.checked)} />
            هذا هو المخرج النهائي للتسليم
          </label>
          <DialogFooter className="sm:col-span-2">
            <Button variant="outline" onClick={onClose}>
              إلغاء
            </Button>
            <Button type="submit" loading={pending} disabled={!source}>
              حفظ المخرج
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ReplaceDialog({ deliverable, onClose }: { deliverable: Deliverable | null; onClose: () => void }) {
  const { run, pending } = useAction();
  const [source, setSource] = useState<DeliverableSource | null>(null);
  const [note, setNote] = useState('');
  useEffect(() => {
    setSource(null);
    setNote('');
  }, [deliverable]);
  if (!deliverable) return null;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={`إصدار جديد: ${deliverable.name}`} description={`سيصبح الإصدار ${deliverable.version + 1} ويُحتفظ بالإصدارات السابقة.`}>
        <form
          className="grid gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!source) return;
            const r = await run(() => deliverableService.addVersion(deliverable.id, source, note), 'تم رفع الإصدار الجديد');
            if (r) onClose();
          }}
        >
          <SourcePicker kind={deliverable.kind} onChange={setSource} />
          <Field label="ملاحظة الإصدار" htmlFor="rv-note">
            <Input id="rv-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="ما الذي تغيّر؟" />
          </Field>
          <DialogFooter>
            <Button variant="outline" onClick={onClose}>
              إلغاء
            </Button>
            <Button type="submit" loading={pending} disabled={!source}>
              رفع الإصدار
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function HistoryDialog({ deliverable, onClose }: { deliverable: Deliverable | null; onClose: () => void }) {
  const [versions, setVersions] = useState<DeliverableVersion[] | null>(null);
  const { userName } = useLookups();
  useEffect(() => {
    setVersions(null);
    if (deliverable) deliverableService.versions(deliverable.id).then(setVersions);
  }, [deliverable]);
  if (!deliverable) return null;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={`سجل الإصدارات: ${deliverable.name}`}>
        {!versions ? (
          <LoadingBlock rows={2} />
        ) : (
          <ol className="space-y-2">
            {versions.map((v) => (
              <li key={v.id} className="flex items-center gap-3 rounded-lg border border-border p-3 text-sm">
                <Badge tone={v.id === deliverable.currentVersionId ? 'primary' : 'neutral'} className="tabular">
                  v{v.version}
                </Badge>
                <div className="min-w-0 flex-1">
                  <p className="truncate" dir="ltr">
                    {v.externalUrl ?? v.fileName}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatDateTime(v.createdAt)} · {userName(v.createdBy)}
                    {!v.externalUrl && ` · ${formatBytes(v.size)}`}
                    {v.note && ` · ${v.note}`}
                  </p>
                </div>
                <Button size="icon-sm" variant="ghost" aria-label={`تنزيل الإصدار ${v.version}`} onClick={() => downloadVersion(v)}>
                  {v.externalUrl ? <ExternalLink /> : <Download />}
                </Button>
              </li>
            ))}
          </ol>
        )}
      </DialogContent>
    </Dialog>
  );
}

function EditDialog({ deliverable, onClose }: { deliverable: Deliverable | null; onClose: () => void }) {
  const { run, pending } = useAction();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  useEffect(() => {
    setName(deliverable?.name ?? '');
    setDescription(deliverable?.description ?? '');
  }, [deliverable]);
  if (!deliverable) return null;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="تعديل بيانات المخرج">
        <form
          className="grid gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            const r = await run(() => deliverableService.update(deliverable.id, { name, description }), 'تم الحفظ');
            if (r !== false) onClose();
          }}
        >
          <Field label="الاسم" htmlFor="ed-name" required>
            <Input id="ed-name" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="الوصف" htmlFor="ed-desc">
            <Textarea id="ed-desc" value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
          <DialogFooter>
            <Button variant="outline" onClick={onClose}>
              إلغاء
            </Button>
            <Button type="submit" loading={pending}>
              حفظ
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** معاينة آمنة للصور النقطية فقط عبر <img> — لا يُعرض HTML أو SVG داخل التطبيق */
function PreviewDialog({ version, onClose }: { version: DeliverableVersion | null; onClose: () => void }) {
  const url = useObjectUrl(version?.blobId, !!version);
  if (!version) return null;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={version.fileName ?? 'معاينة'} wide>
        {url ? <img src={url} alt={version.fileName ?? ''} className="mx-auto max-h-[70dvh] rounded-lg object-contain" /> : <LoadingBlock rows={1} />}
      </DialogContent>
    </Dialog>
  );
}
