import React, { useState } from 'react'
import type { SocialSession } from '../../api/types'
import {
  useSocialSessions,
  useJoinSocialSession,
  useLeaveSocialSession,
  useMember,
  useErrorSimulation,
} from '../../api/hooks'
import { useAuth } from '../../hooks/useAuth'
import { getTodayIST, formatDateIST, formatTimeIST, formatMoney } from '../../lib/format'
import {
  Card,
  Button,
  StatusChip,
  SectionHeader,
  useToast,
} from '../../components/ui'
import {
  Users,
  Calendar,
  Clock,
  CheckCircle,
  AlertTriangle,
  Sparkles,
  Info,
  LogOut,
  UserPlus,
  Dumbbell,
  Layers,
} from 'lucide-react'

export default function PortalSocial() {
  const { user } = useAuth()
  const { toast } = useToast()
  const memberId = user?.member_id ?? 1

  const todayStr = getTodayIST()
  const { data: member } = useMember(memberId)
  const isGoldMember = (member?.membership?.plan_code ?? member?.tier) === 'GOLD'

  const { data: sessions = [], isLoading, isError } = useSocialSessions({
    from: todayStr,
    memberId,
  })

  const joinMutation = useJoinSocialSession()
  const leaveMutation = useLeaveSocialSession()
  const { currentError, setSimulatedError } = useErrorSimulation()

  const [joiningId, setJoiningId] = useState<number | null>(null)
  const [leavingId, setLeavingId] = useState<number | null>(null)

  const handleJoin = async (session: SocialSession) => {
    setJoiningId(session.id)
    try {
      await joinMutation.mutateAsync({
        sessionId: session.id,
        memberId,
        memberName: member?.full_name ?? user?.full_name,
      })
      toast(`You joined "${session.title}"! See you on the court.`, 'success')
    } catch (err: any) {
      toast(err?.error?.message || 'Failed to join social session', 'error')
    } finally {
      setJoiningId(null)
    }
  }

  const handleLeave = async (session: SocialSession) => {
    setLeavingId(session.id)
    try {
      await leaveMutation.mutateAsync({
        sessionId: session.id,
        memberId,
      })
      toast(`You left "${session.title}". Your spot has been freed.`, 'info')
    } catch (err: any) {
      toast(err?.error?.message || 'Failed to leave social session', 'error')
    } finally {
      setLeavingId(null)
    }
  }

  return (
    <div className="space-y-6 pb-8">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-text-primary tracking-tight">
              Friday Social Play
            </h1>
            <StatusChip label="Club Community" variant="info" />
          </div>
          <p className="text-xs text-text-secondary mt-0.5">
            Weekly organized club mixers, doubles rallies, and social matches
          </p>
        </div>
      </div>

      {/* ── Club Notice Banner ── */}
      <div className="p-4 rounded-3xl bg-surface border border-border-light text-xs text-ink flex items-start gap-3 shadow-soft">
        <div className="w-8 h-8 rounded-xl bg-primary-500 text-ink border border-ink flex items-center justify-center flex-shrink-0 mt-0.5">
          <Sparkles size={18} />
        </div>
        <div className="space-y-1">
          <p className="font-bold text-sm text-ink">
            How Social Sessions Work (SRS §3.2.6)
          </p>
          <p className="text-[11px] text-ink leading-relaxed">
            Friday social sessions are coach-facilitated club mixers with rotational doubles play. Joining social sessions does <span className="font-bold">NOT</span> count against your 2-per-day court reservation quota. Free for Gold members!
          </p>
        </div>
      </div>

      {/* ── Sessions List ── */}
      {isLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="p-6 h-40 animate-pulse bg-surface">
              <div className="h-full" />
            </Card>
          ))}
        </div>
      ) : isError ? (
        <Card className="p-8 text-center text-accent-red space-y-2">
          <AlertTriangle size={32} className="mx-auto" />
          <p className="font-bold text-sm">Failed to load social sessions</p>
          <p className="text-xs text-text-secondary">Please check your connection and try again.</p>
        </Card>
      ) : sessions.length === 0 ? (
        <Card className="p-12 text-center space-y-3">
          <Users size={36} className="mx-auto text-text-tertiary" />
          <div>
            <p className="font-bold text-sm text-text-primary">No upcoming social sessions</p>
            <p className="text-xs text-text-secondary mt-0.5">
              Check back soon for next week's Friday mixer schedule!
            </p>
          </div>
        </Card>
      ) : (
        <div className="space-y-4">
          {sessions.map((session) => {
            const hasJoined = session.is_joined || session.participants.some((p) => p.member_id === memberId)
            const isFull = session.joined_count >= session.capacity
            const spotsRemaining = Math.max(0, session.capacity - session.joined_count)
            const fillPct = Math.min(100, Math.round((session.joined_count / session.capacity) * 100))

            const isFree = session.fee_paise === 0 || isGoldMember
            const feeDisplay = isFree ? 'Free' : formatMoney(session.fee_paise)

            return (
              <Card
                key={session.id}
                className={`p-5 transition-all space-y-4 ${
                  hasJoined ? 'border-primary-300 bg-primary-50/20' : ''
                }`}
              >
                {/* Top Row: Title & Badges */}
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-canvas text-text-secondary border border-border-light uppercase">
                        {session.sport}
                      </span>
                      {hasJoined && (
                        <StatusChip label="You're Joined" variant="success" />
                      )}
                      {isFull && !hasJoined && (
                        <StatusChip label="Session Full" variant="warning" />
                      )}
                    </div>
                    <h3 className="font-bold text-base sm:text-lg text-text-primary mt-1.5">
                      {session.title}
                    </h3>
                  </div>

                  {/* Fee badge */}
                  <div className="sm:text-right">
                    <span className="text-xs text-text-tertiary block">Session Fee</span>
                    <span className={`font-black text-sm sm:text-base ${isFree ? 'text-accent-green' : 'text-text-primary'}`}>
                      {feeDisplay}
                    </span>
                  </div>
                </div>

                {/* Session Date & Court Info */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-text-secondary pt-2 border-t border-border-light">
                  <div className="flex items-center gap-2">
                    <Calendar size={15} className="text-primary-500" />
                    <span className="font-medium text-text-primary">{formatDateIST(session.start_at)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock size={15} className="text-primary-500" />
                    <span>
                      {formatTimeIST(session.start_at)} – {formatTimeIST(session.end_at)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 sm:col-span-2">
                    <Dumbbell size={15} className="text-text-tertiary" />
                    <span>{session.court_name}</span>
                  </div>
                </div>

                {/* Capacity Progress Bar */}
                <div className="space-y-1.5 pt-2">
                  <div className="flex justify-between text-xs font-medium">
                    <span className="text-text-secondary">
                      Participants ({session.joined_count} / {session.capacity})
                    </span>
                    <span className={isFull ? 'text-accent-red font-bold' : 'text-primary-600 font-semibold'}>
                      {isFull ? 'At Capacity' : `${spotsRemaining} spot${spotsRemaining === 1 ? '' : 's'} left`}
                    </span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-canvas border border-border-light overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        isFull
                          ? 'bg-ink'
                          : fillPct > 75
                          ? 'bg-brand-purple'
                          : 'bg-primary-500'
                      }`}
                      style={{ width: `${fillPct}%` }}
                    />
                  </div>
                </div>

                {/* Bottom Action Row */}
                <div className="flex items-center justify-between pt-3 border-t border-border-light">
                  <div className="flex items-center -space-x-2 overflow-hidden py-0.5">
                    {session.participants.slice(0, 4).map((p, idx) => (
                      <div
                        key={idx}
                        className="inline-block h-7 w-7 rounded-full ring-2 ring-surface bg-surface-dark text-white flex items-center justify-center font-bold text-[10px] border border-ink"
                        title={p.member_name}
                      >
                        {p.member_name.slice(0, 2).toUpperCase()}
                      </div>
                    ))}
                    {session.participants.length > 4 && (
                      <span className="text-[10px] font-bold text-text-tertiary pl-3">
                        +{session.participants.length - 4} others
                      </span>
                    )}
                  </div>

                  <div>
                    {hasJoined ? (
                      <Button
                        variant="secondary"
                        size="sm"
                        icon={LogOut}
                        disabled={leavingId === session.id}
                        onClick={() => handleLeave(session)}
                        className="touch-target text-xs text-ink hover:bg-status-error hover:border-status-error-accent"
                      >
                        {leavingId === session.id ? 'Leaving...' : 'Leave Session'}
                      </Button>
                    ) : (
                      <Button
                        variant="primary"
                        size="sm"
                        icon={UserPlus}
                        disabled={isFull || joiningId === session.id}
                        onClick={() => handleJoin(session)}
                        className="touch-target text-xs"
                      >
                        {joiningId === session.id
                          ? 'Joining...'
                          : isFull
                          ? 'Session Full'
                          : 'Join Session'}
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
