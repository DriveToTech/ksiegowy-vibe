'use client';

import { useState } from 'react';
import type { Member, Invite, MemberRole } from '../../../lib/api-types';
import { createInvite, updateMemberRole, removeMember } from '../../../lib/api-client';
import { Button } from '../../../components/atoms/Button';
import { Input } from '../../../components/atoms/Input';
import { Select } from '../../../components/atoms/Select';
import { Surface } from '../../../components/atoms/Surface';
import { Banner } from '../../../components/molecules/Banner';
import { EmptyState } from '../../../components/molecules/EmptyState';
import { FormField } from '../../../components/molecules/FormField';
import { t } from '../../../lib/translations';

const ROLES: MemberRole[] = ['ADMIN', 'ACCOUNTANT', 'VIEWER'];

export function MembersTab({
  companyId,
  currentUserId,
  isAdmin,
  initialMembers,
  initialInvites,
}: {
  companyId: string;
  currentUserId: string;
  isAdmin: boolean;
  initialMembers: Member[];
  initialInvites: Invite[];
}) {
  const [members, setMembers] = useState(initialMembers);
  const [invites, setInvites] = useState(initialInvites);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<MemberRole>('VIEWER');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const notify = (msg: string) => {
    setSuccess(msg);
    setTimeout(() => setSuccess(null), 4000);
  };

  const handleInvite = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    createInvite(companyId, { email: inviteEmail, role: inviteRole })
      .then((inv) => {
        setInvites((prev) => [...prev, { id: inv.id, email: inv.email, role: inv.role, expiresAt: inv.expiresAt, createdAt: new Date().toISOString() }]);
        setInviteEmail('');
        notify(t.members.inviteSent(inv.email, inv.token));
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Error'))
      .finally(() => setBusy(false));
  };

  const handleRoleChange = (userId: string, role: MemberRole) => {
    updateMemberRole(companyId, userId, role)
      .then((updated) => {
        setMembers((prev) => prev.map((m) => (m.userId === userId ? updated : m)));
        notify(t.members.roleUpdated);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Error'));
  };

  const handleRemove = (userId: string, email: string) => {
    if (!confirm(t.members.removeConfirm(email))) return;
    removeMember(companyId, userId)
      .then(() => {
        setMembers((prev) => prev.filter((m) => m.userId !== userId));
        notify(t.members.memberRemoved);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Error'));
  };

  return (
    <div className="space-y-6">
      {error && <Banner tone="error">{error}</Banner>}
      {success && <Banner tone="success">{success}</Banner>}

      <Surface tone="panel" className="space-y-5 p-6 xl:mr-10">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-foreground">
            {t.members.title(members.length)}
          </h2>
          <p className="mt-1 text-sm text-muted">Role członków zespołu i dostęp do pracy na dokumentach firmy.</p>
        </div>

        {members.length === 0 ? (
          <EmptyState
            title="Brak członków"
            description="Po dodaniu użytkowników będą widoczni tutaj wraz z przypisaną rolą."
          />
        ) : (
          <>
            <div className="hidden overflow-x-auto lg:block">
              <table className="min-w-full border-collapse text-sm">
                <thead className="bg-surface-muted/75 text-left text-muted">
                  <tr>
                    <HeaderCell>{t.members.columns.email}</HeaderCell>
                    <HeaderCell>{t.members.columns.name}</HeaderCell>
                    <HeaderCell>{t.members.columns.role}</HeaderCell>
                    {isAdmin ? <HeaderCell className="text-right">Akcje</HeaderCell> : null}
                  </tr>
                </thead>
                <tbody>
                  {members.map((member) => (
                    <tr key={member.userId} className="border-t border-outline hover:bg-surface-raised/35">
                      <BodyCell>{member.user.email}</BodyCell>
                      <BodyCell>{member.user.name ?? '—'}</BodyCell>
                      <BodyCell>
                        {isAdmin && member.userId !== currentUserId ? (
                          <Select
                            value={member.role}
                            onChange={(e) => handleRoleChange(member.userId, e.target.value as MemberRole)}
                            className="max-w-[200px]"
                          >
                            {ROLES.map((role) => (
                              <option key={role} value={role}>{t.members.roles[role]}</option>
                            ))}
                          </Select>
                        ) : (
                          <span className="font-medium text-foreground">{t.members.roles[member.role]}</span>
                        )}
                      </BodyCell>
                      {isAdmin ? (
                        <BodyCell className="text-right">
                          {member.userId !== currentUserId ? (
                            <Button
                              variant="ghost"
                              className="text-error-ink hover:bg-error-soft"
                              onClick={() => handleRemove(member.userId, member.user.email)}
                            >
                              {t.members.remove}
                            </Button>
                          ) : null}
                        </BodyCell>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="grid gap-4 lg:hidden">
              {members.map((member) => (
                <Surface key={member.userId} tone="inset" className="space-y-4 p-4">
                  <div className="space-y-1">
                    <p className="font-semibold text-foreground">{member.user.email}</p>
                    <p className="text-sm text-muted">{member.user.name ?? '—'}</p>
                  </div>
                  <div className="space-y-3">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted">Rola</p>
                      {isAdmin && member.userId !== currentUserId ? (
                        <Select
                          value={member.role}
                          onChange={(e) => handleRoleChange(member.userId, e.target.value as MemberRole)}
                          className="mt-2"
                        >
                          {ROLES.map((role) => (
                            <option key={role} value={role}>{t.members.roles[role]}</option>
                          ))}
                        </Select>
                      ) : (
                        <p className="mt-1 text-sm font-medium text-foreground">{t.members.roles[member.role]}</p>
                      )}
                    </div>
                    {isAdmin && member.userId !== currentUserId ? (
                      <Button
                        variant="ghost"
                        className="w-full text-error-ink hover:bg-error-soft"
                        onClick={() => handleRemove(member.userId, member.user.email)}
                      >
                        {t.members.remove}
                      </Button>
                    ) : null}
                  </div>
                </Surface>
              ))}
            </div>
          </>
        )}
      </Surface>

      {invites.length > 0 ? (
        <Surface tone="panel" className="space-y-5 p-6 xl:translate-x-6">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight text-foreground">
              {t.members.pendingInvites}
            </h2>
            <p className="mt-1 text-sm text-muted">Zaproszenia oczekujące na wykorzystanie przez nowych członków zespołu.</p>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {invites.map((invite) => (
              <Surface key={invite.id} tone="inset" className="space-y-3 p-4">
                <div>
                  <p className="font-semibold text-foreground">{invite.email}</p>
                  <p className="mt-1 text-sm text-muted">{t.members.roles[invite.role]}</p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted">Wygasa</p>
                  <p className="mt-1 text-sm font-medium text-foreground">{invite.expiresAt.slice(0, 10)}</p>
                </div>
              </Surface>
            ))}
          </div>
        </Surface>
      ) : null}

      {isAdmin ? (
        <Surface tone="panel" className="space-y-5 p-6 max-w-4xl">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight text-foreground">
              {t.members.inviteSection}
            </h2>
            <p className="mt-1 text-sm text-muted">Wyślij nowe zaproszenie i przypisz poziom uprawnień przed dołączeniem do firmy.</p>
          </div>

          <form onSubmit={handleInvite} className="grid gap-4 md:grid-cols-[minmax(0,1fr)_220px_auto] md:items-end">
            <FormField label={t.members.emailLabel}>
              <Input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                required
                placeholder={t.members.emailPlaceholder}
              />
            </FormField>
            <FormField label={t.members.roleLabel}>
              <Select value={inviteRole} onChange={(e) => setInviteRole(e.target.value as MemberRole)}>
                {ROLES.map((role) => (
                  <option key={role} value={role}>{t.members.roles[role]}</option>
                ))}
              </Select>
            </FormField>
            <Button type="submit" disabled={busy} className="md:mb-[1px]">
              {busy ? t.members.sending : t.members.sendInvite}
            </Button>
          </form>
        </Surface>
      ) : null}
    </div>
  );
}

function HeaderCell({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <th className={`px-5 py-4 text-xs font-semibold uppercase tracking-[0.16em] ${className}`}>{children}</th>;
}

function BodyCell({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-5 py-4 align-middle text-foreground ${className}`}>{children}</td>;
}
