import {PageHeader} from '../../../components/molecules/PageHeader';
import { t } from '../../../lib/translations';
import {EmptyState} from "../../../components/molecules/EmptyState";
import Link from "next/link";
import {Button} from "../../../components/atoms/Button";
import {ClearanceStepper, type ClearanceStep} from "../../../components/molecules/ClearanceStepper";
import {Surface} from "../../../components/atoms/Surface";
import {formatDate} from "../../../lib/format";
import {getActiveCompany, getReport} from "../../../lib/api";
import {ErrorState} from "../../../components/molecules/ErrorState";
import {ReportDetails} from "../../../lib/api-types";

function buildClearanceSteps(report: ReportDetails): ClearanceStep[] {
    console.log(report);
    return [
        { label: t.complianceDetails.stepper.created, meta: formatDate(report.createdAt), state: 'done' },
        // { label: t.invoiceDetail.stepper.sent, meta: sentState === 'done' ? t.invoiceDetail.stepper.doneMeta : t.invoiceDetail.stepper.pendingMeta, state: sentState },
        // {
        //     label: invoice.ksefStatus === 'rejected' ? t.invoiceDetail.stepper.rejected : t.invoiceDetail.stepper.accepted,
        //     meta: clearanceState === 'pending' ? t.invoiceDetail.stepper.pendingMeta : t.invoiceDetail.stepper.doneMeta,
        //     state: clearanceState,
        // },
        // {
        //     label: t.invoiceDetail.stepper.paid,
        //     meta: isPaid ? t.invoiceDetail.stepper.doneMeta : t.invoiceDetail.stepper.due(formatDate(invoice.paymentDueDate)),
        //     state: isPaid ? 'done' : 'pending',
        // },
    ];
}


export default async function CompliancePage({
    params,
}: {
    params: Promise<{ id: string }>;
})  {
    const { id } = await params;

    let companyId: string | null = null;
    let errorMsg: string | null = null;

    try {
        const { activeCompanyId } = await getActiveCompany();
        companyId = activeCompanyId;
    } catch (e) {
        errorMsg = e instanceof Error ? e.message : t.invoiceDetail.errors.companyLoadFailed;
    }

    if (errorMsg || !companyId) {
        return (
            <ErrorState message={errorMsg ?? t.invoiceDetail.errors.companyNotFound} />
        );
    }

    if (!companyId) {
        return (
            <div className="space-y-6">
                <PageHeader
                    eyebrow={t.compliance.pageEyebrow}
                    title={t.compliance.pageTitle}
                    description={t.compliance.pageDescription}
                />
                <EmptyState
                    title={t.compliance.noCompanyTitle}
                    description={t.compliance.noCompanyDescription}
                    action={
                        <Link href="/dashboard/settings">
                            <Button>{t.settings.goToSettings}</Button>
                        </Link>
                    }
                />
            </div>
        );
    }

    let report;
    try {
        report = await getReport(companyId, id);
    } catch (e) {
        errorMsg = e instanceof Error ? e.message : t.compliance.errors.reportLoadFailed;
        return (
            <div className="space-y-4">
                <ErrorState message={errorMsg} />
                <Link href="/dashboard/invoices">
                    <Button variant="secondary">{t.compliance.backButton}</Button>
                </Link>
            </div>
        );
    }

    const clearanceSteps = buildClearanceSteps(report);

    return (
        <div className="space-y-6">
            <PageHeader
                eyebrow={t.compliance.pageEyebrow}
                title={t.compliance.pageTitle}
                description={t.compliance.pageDescription}
                actions={
                    <>
                        <Link href="/dashboard/compliance/download/xml">
                            <Button variant="secondary">{t.compliance.downloadXml}</Button>
                        </Link>
                        <Link href="/dashboard/compliance/submit/jpk">
                            <Button>{t.compliance.submitJPK}</Button>
                        </Link>
                    </>
                }
            />

            <Surface tone="panel" className="space-y-5 p-5">
                <div className="flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-foreground">{t.invoiceDetail.sections.clearanceTitle}</h2>
                    <span className="inline-flex items-center gap-1.5 rounded-chip border border-warning-ink/30 bg-warning px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.1em] text-warning-ink">
            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-warning-ink" />
                        {report.environment}
          </span>
                </div>
                <ClearanceStepper steps={clearanceSteps} />
                {report.id ? (
                    <div className="flex flex-col gap-3 rounded-inset bg-surface-raised p-4 sm:flex-row sm:items-center">
                        <div>
                            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">{t.invoiceDetail.fields.ksefReference}</p>
                            <p className="font-mono text-sm text-foreground">{report.id}</p>
                        </div>
                        <p className="text-xs text-muted sm:ml-auto sm:max-w-xs">{t.invoiceDetail.ksefReferenceHint}</p>
                    </div>
                ) : null}
            </Surface>

        </div>
    );
}