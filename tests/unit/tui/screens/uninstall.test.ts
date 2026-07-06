import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Hoisted mocks — must be defined before any imports
// ---------------------------------------------------------------------------

const {
  mockIntro,
  mockOutro,
  mockCancel,
  mockSpinner,
  mockMultiselect,
  mockConfirm,
  mockIsCancel,
  mockRunUninstall,
  mockRunUninstallPlan,
  mockPrintRemovalSummary,
  state,
} = vi.hoisted(() => {
  const state = {
    multiselectResult: ['anvil-home', 'cc-plugin'] as unknown,
    confirmResult: true as unknown,
  }
  return {
    state,
    mockIntro: vi.fn(),
    mockOutro: vi.fn(),
    mockCancel: vi.fn(),
    mockSpinner: vi.fn(() => ({ start: vi.fn(), stop: vi.fn() })),
    mockMultiselect: vi.fn(async () => state.multiselectResult),
    mockConfirm: vi.fn(async () => state.confirmResult),
    mockIsCancel: vi.fn((v: unknown) => typeof v === 'symbol'),
    mockRunUninstall: vi.fn(async () => ({
      removed: ['/fake/.anvil', '/fake/.claude-plugin'],
    })),
    mockRunUninstallPlan: vi.fn(() => ({
      scope: 'project' as const,
      willRemove: ['/fake/.anvil', '/fake/.claude-plugin'],
      targets: [
        { id: 'anvil-home', present: true, paths: ['/fake/.anvil'] },
        { id: 'cc-plugin', present: true, paths: ['/fake/.claude-plugin'] },
        {
          id: 'cc-skills',
          present: false,
          paths: ['/fake/.claude/skills/anvil'],
        },
      ],
    })),
    mockPrintRemovalSummary: vi.fn(),
  }
})

vi.mock('@clack/prompts', () => ({
  intro: mockIntro,
  outro: mockOutro,
  cancel: mockCancel,
  spinner: mockSpinner,
  multiselect: mockMultiselect,
  confirm: mockConfirm,
  isCancel: mockIsCancel,
}))

vi.mock('../../../../src/installer/uninstall.js', () => ({
  runUninstall: mockRunUninstall,
  runUninstallPlan: mockRunUninstallPlan,
}))

vi.mock('../../../../src/commands/cli/common/report.js', () => ({
  printRemovalSummary: mockPrintRemovalSummary,
}))

// Import module under test AFTER all mocks are set up
import { runUninstallTui } from '../../../../src/tui/screens/uninstall.js'

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks()
  state.multiselectResult = ['anvil-home', 'cc-plugin']
  state.confirmResult = true
  mockMultiselect.mockImplementation(async () => state.multiselectResult)
  mockConfirm.mockImplementation(async () => state.confirmResult)
  mockIsCancel.mockImplementation((v: unknown) => typeof v === 'symbol')
  mockRunUninstall.mockResolvedValue({
    removed: ['/fake/.anvil', '/fake/.claude-plugin'],
  })
  mockRunUninstallPlan.mockReturnValue({
    scope: 'project' as const,
    willRemove: ['/fake/.anvil', '/fake/.claude-plugin'],
    targets: [
      { id: 'anvil-home', present: true, paths: ['/fake/.anvil'] },
      { id: 'cc-plugin', present: true, paths: ['/fake/.claude-plugin'] },
      {
        id: 'cc-skills',
        present: false,
        paths: ['/fake/.claude/skills/anvil'],
      },
    ],
  })
  mockSpinner.mockReturnValue({ start: vi.fn(), stop: vi.fn() })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('runUninstallTui', () => {
  it('shows intro on entry', async () => {
    await runUninstallTui()
    expect(mockIntro).toHaveBeenCalledOnce()
  })

  it('calls runUninstallPlan to compute what is installed', async () => {
    await runUninstallTui()
    expect(mockRunUninstallPlan).toHaveBeenCalledOnce()
  })

  it('exits early with outro when nothing is installed', async () => {
    mockRunUninstallPlan.mockReturnValueOnce({
      scope: 'project' as const,
      willRemove: [],
      targets: [{ id: 'anvil-home', present: false, paths: ['/fake/.anvil'] }],
    })
    await runUninstallTui()
    expect(mockMultiselect).not.toHaveBeenCalled()
    expect(mockRunUninstall).not.toHaveBeenCalled()
    expect(mockOutro).toHaveBeenCalledOnce()
    expect(String(mockOutro.mock.calls[0]?.[0])).toMatch(/nothing/i)
  })

  it('shows multiselect with only present targets', async () => {
    await runUninstallTui()
    expect(mockMultiselect).toHaveBeenCalledOnce()
    const callArg = mockMultiselect.mock.calls[0]?.[0] as {
      options: Array<{ value: string }>
    }
    const optionValues = callArg.options.map((o) => o.value)
    expect(optionValues).toContain('anvil-home')
    expect(optionValues).toContain('cc-plugin')
    expect(optionValues).not.toContain('cc-skills') // present: false
  })

  it('cancels cleanly when user cancels multiselect', async () => {
    state.multiselectResult = Symbol('cancel')
    await runUninstallTui()
    expect(mockCancel).toHaveBeenCalled()
    expect(mockRunUninstall).not.toHaveBeenCalled()
  })

  it('does nothing when user selects no components', async () => {
    state.multiselectResult = []
    await runUninstallTui()
    expect(mockConfirm).not.toHaveBeenCalled()
    expect(mockRunUninstall).not.toHaveBeenCalled()
    expect(mockOutro).toHaveBeenCalledOnce()
  })

  it('shows confirmation prompt before executing', async () => {
    await runUninstallTui()
    expect(mockConfirm).toHaveBeenCalledOnce()
  })

  it('cancels when user declines confirmation', async () => {
    state.confirmResult = false
    await runUninstallTui()
    expect(mockRunUninstall).not.toHaveBeenCalled()
    expect(mockCancel).toHaveBeenCalled()
  })

  it('cancels when user cancels confirmation prompt', async () => {
    state.confirmResult = Symbol('cancel')
    await runUninstallTui()
    expect(mockRunUninstall).not.toHaveBeenCalled()
    expect(mockCancel).toHaveBeenCalled()
  })

  it('calls runUninstall on happy path', async () => {
    await runUninstallTui()
    expect(mockRunUninstall).toHaveBeenCalledOnce()
  })

  it('calls printRemovalSummary after successful removal', async () => {
    await runUninstallTui()
    expect(mockPrintRemovalSummary).toHaveBeenCalledOnce()
  })

  it('calls outro with "Done" on happy path', async () => {
    await runUninstallTui()
    expect(mockOutro).toHaveBeenCalledOnce()
    expect(String(mockOutro.mock.calls[0]?.[0])).toMatch(/done/i)
  })

  it('passes scope from baseOpts to runUninstallPlan', async () => {
    await runUninstallTui({ scope: 'global', home: '/tmp/fake' })
    expect(mockRunUninstallPlan).toHaveBeenCalledWith(
      expect.objectContaining({ scope: 'global', home: '/tmp/fake' }),
    )
  })

  it('spinner is started and stopped during execution', async () => {
    const spinnerInstance = { start: vi.fn(), stop: vi.fn() }
    mockSpinner.mockReturnValueOnce(spinnerInstance)
    await runUninstallTui()
    expect(spinnerInstance.start).toHaveBeenCalledOnce()
    expect(spinnerInstance.stop).toHaveBeenCalledOnce()
  })
})
