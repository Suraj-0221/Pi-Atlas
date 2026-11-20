/**
 * Tab switcher component (Date, Name, Image)
 */

export type TabType = 'date' | 'name' | 'image';

export class TabManager {
  private activeTab: TabType = 'date';
  private onTabChange: (tab: TabType) => void;
  private tabButtons: HTMLButtonElement[];

  constructor(onTabChange: (tab: TabType) => void) {
    this.onTabChange = onTabChange;
    this.tabButtons = Array.from(document.querySelectorAll('.tab-btn')) as HTMLButtonElement[];

    this.tabButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.tab as TabType;
        if (tab && tab !== this.activeTab) {
          this.setTab(tab);
        }
      });
    });
  }

  public setTab(tab: TabType) {
    this.activeTab = tab;
    this.tabButtons.forEach(btn => {
      if (btn.dataset.tab === tab) {
        btn.classList.add('active');
        btn.setAttribute('aria-selected', 'true');
      } else {
        btn.classList.remove('active');
        btn.setAttribute('aria-selected', 'false');
      }
    });
    this.onTabChange(tab);
  }

  public getActiveTab(): TabType {
    return this.activeTab;
  }
}
