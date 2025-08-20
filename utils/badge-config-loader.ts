import type {BadgeConfig, DetectedTechnology} from '../types/badges.js'

import {createBadgeUrl, type BadgeOptions} from '@bfra.me/badge-config'

/**
 * Badge configuration generator using @bfra.me/badge-config
 */
export class BadgeConfigLoader {
  /**
   * Technology to badge configuration mapping
   */
  private static readonly TECHNOLOGY_BADGES: Record<string, BadgeOptions> = {
    // Languages
    typescript: {
      label: 'TypeScript',
      message: '',
      color: '#3178C6',
      logo: 'typescript',
      style: 'flat-square',
    },
    javascript: {
      label: 'JavaScript',
      message: '',
      color: '#F7DF1E',
      logo: 'javascript',
      style: 'flat-square',
    },
    python: {
      label: 'Python',
      message: '',
      color: '#3776AB',
      logo: 'python',
      style: 'flat-square',
    },
    java: {
      label: 'Java',
      message: '',
      color: '#ED8B00',
      logo: 'oracle',
      style: 'flat-square',
    },
    csharp: {
      label: 'C#',
      message: '',
      color: '#239120',
      logo: 'csharp',
      style: 'flat-square',
    },
    go: {
      label: 'Go',
      message: '',
      color: '#00ADD8',
      logo: 'go',
      style: 'flat-square',
    },
    rust: {
      label: 'Rust',
      message: '',
      color: '#000000',
      logo: 'rust',
      style: 'flat-square',
    },
    php: {
      label: 'PHP',
      message: '',
      color: '#777BB4',
      logo: 'php',
      style: 'flat-square',
    },
    swift: {
      label: 'Swift',
      message: '',
      color: '#FA7343',
      logo: 'swift',
      style: 'flat-square',
    },
    kotlin: {
      label: 'Kotlin',
      message: '',
      color: '#7F52FF',
      logo: 'kotlin',
      style: 'flat-square',
    },

    // Frameworks
    react: {
      label: 'React',
      message: '',
      color: '#61DAFB',
      logo: 'react',
      style: 'flat-square',
    },
    vue: {
      label: 'Vue.js',
      message: '',
      color: '#4FC08D',
      logo: 'vuedotjs',
      style: 'flat-square',
    },
    angular: {
      label: 'Angular',
      message: '',
      color: '#DD0031',
      logo: 'angular',
      style: 'flat-square',
    },
    svelte: {
      label: 'Svelte',
      message: '',
      color: '#FF3E00',
      logo: 'svelte',
      style: 'flat-square',
    },
    nextjs: {
      label: 'Next.js',
      message: '',
      color: '#000000',
      logo: 'nextdotjs',
      style: 'flat-square',
    },
    express: {
      label: 'Express',
      message: '',
      color: '#000000',
      logo: 'express',
      style: 'flat-square',
    },
    fastapi: {
      label: 'FastAPI',
      message: '',
      color: '#009688',
      logo: 'fastapi',
      style: 'flat-square',
    },
    django: {
      label: 'Django',
      message: '',
      color: '#092E20',
      logo: 'django',
      style: 'flat-square',
    },
    flask: {
      label: 'Flask',
      message: '',
      color: '#000000',
      logo: 'flask',
      style: 'flat-square',
    },
    spring: {
      label: 'Spring',
      message: '',
      color: '#6DB33F',
      logo: 'spring',
      style: 'flat-square',
    },

    // Databases
    postgresql: {
      label: 'PostgreSQL',
      message: '',
      color: '#336791',
      logo: 'postgresql',
      style: 'flat-square',
    },
    mysql: {
      label: 'MySQL',
      message: '',
      color: '#4479A1',
      logo: 'mysql',
      style: 'flat-square',
    },
    mongodb: {
      label: 'MongoDB',
      message: '',
      color: '#47A248',
      logo: 'mongodb',
      style: 'flat-square',
    },
    redis: {
      label: 'Redis',
      message: '',
      color: '#DC382D',
      logo: 'redis',
      style: 'flat-square',
    },
    sqlite: {
      label: 'SQLite',
      message: '',
      color: '#003B57',
      logo: 'sqlite',
      style: 'flat-square',
    },

    // Tools
    docker: {
      label: 'Docker',
      message: '',
      color: '#2496ED',
      logo: 'docker',
      style: 'flat-square',
    },
    kubernetes: {
      label: 'Kubernetes',
      message: '',
      color: '#326CE5',
      logo: 'kubernetes',
      style: 'flat-square',
    },
    git: {
      label: 'Git',
      message: '',
      color: '#F05032',
      logo: 'git',
      style: 'flat-square',
    },
    github: {
      label: 'GitHub',
      message: '',
      color: '#181717',
      logo: 'github',
      style: 'flat-square',
    },
    gitlab: {
      label: 'GitLab',
      message: '',
      color: '#FCA326',
      logo: 'gitlab',
      style: 'flat-square',
    },
    vscode: {
      label: 'VS Code',
      message: '',
      color: '#007ACC',
      logo: 'visualstudiocode',
      style: 'flat-square',
    },
    eslint: {
      label: 'ESLint',
      message: '',
      color: '#4B32C3',
      logo: 'eslint',
      style: 'flat-square',
    },
    prettier: {
      label: 'Prettier',
      message: '',
      color: '#F7B93E',
      logo: 'prettier',
      style: 'flat-square',
    },
    vitest: {
      label: 'Vitest',
      message: '',
      color: '#6E9F18',
      logo: 'vitest',
      style: 'flat-square',
    },

    // Cloud
    aws: {
      label: 'AWS',
      message: '',
      color: '#232F3E',
      logo: 'amazonaws',
      style: 'flat-square',
    },
    azure: {
      label: 'Azure',
      message: '',
      color: '#0078D4',
      logo: 'microsoftazure',
      style: 'flat-square',
    },
    gcp: {
      label: 'Google Cloud',
      message: '',
      color: '#4285F4',
      logo: 'googlecloud',
      style: 'flat-square',
    },
  }

  private customOverrides: Record<string, Partial<BadgeOptions>> = {}

  /**
   * Add custom badge configuration overrides
   */
  addCustomOverrides(overrides: Record<string, Partial<BadgeOptions>>): void {
    this.customOverrides = {...this.customOverrides, ...overrides}
  }

  /**
   * Check if a technology is supported for badge generation
   */
  isTechnologySupported(technologyName: string): boolean {
    return Object.hasOwnProperty.call(BadgeConfigLoader.TECHNOLOGY_BADGES, technologyName.toLowerCase())
  }

  /**
   * Get supported technology names
   */
  getSupportedTechnologies(): string[] {
    return Object.keys(BadgeConfigLoader.TECHNOLOGY_BADGES)
  }

  /**
   * Generate badge configurations from detected technologies
   */
  async generateBadgeConfigs(technologies: DetectedTechnology[]): Promise<BadgeConfig[]> {
    const configs: BadgeConfig[] = []

    for (const tech of technologies) {
      const badgeTemplate = this.getEffectiveBadgeOptions(tech.name)
      if (!badgeTemplate) {
        continue // Skip unknown technologies
      }

      // Create badge options with technology-specific message
      const badgeOptions: BadgeOptions = {
        ...badgeTemplate,
        message: this.generateTechMessage(tech),
      }

      // Generate the badge URL using @bfra.me/badge-config (for reference/validation)
      createBadgeUrl(badgeOptions)

      configs.push({
        technologyId: tech.id,
        label: badgeOptions.label,
        message: badgeOptions.message,
        color: (badgeOptions.color as string)?.replace('#', ''),
        logo: badgeOptions.logo,
        style: (badgeOptions.style as 'flat' | 'flat-square' | 'plastic' | 'for-the-badge' | 'social') || 'flat-square',
      })
    }

    return configs
  }

  /**
   * Get effective badge options for a technology (with overrides applied)
   */
  private getEffectiveBadgeOptions(technologyName: string): BadgeOptions | null {
    const normalizedName = technologyName.toLowerCase()
    const baseOptions = BadgeConfigLoader.TECHNOLOGY_BADGES[normalizedName]

    if (!baseOptions) {
      return null
    }

    // Apply custom overrides if they exist
    const overrides = this.customOverrides[normalizedName]
    if (overrides) {
      return {...baseOptions, ...overrides}
    }

    return baseOptions
  }

  /**
   * Generate appropriate message for technology badge
   */
  private generateTechMessage(tech: DetectedTechnology): string {
    // Use version if available and confidence is high
    if (tech.version != null && tech.version.trim() !== '' && tech.confidence >= 0.8) {
      return tech.version
    }

    // Use confidence-based message
    if (tech.confidence >= 0.9) {
      return 'primary'
    } else if (tech.confidence >= 0.7) {
      return 'used'
    } else {
      return 'detected'
    }
  }
}
