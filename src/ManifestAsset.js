const path = require('path')
const Asset = require('parcel-bundler/src/Asset')
const JSONAsset = require('parcel-bundler/src/assets/JSONAsset')

/**
 * A shared asset that handles:
 * - PWA .webmanifest
 * - PWA manifest.json
 * - WebExtension manifest.json
 */
class ManifestAsset extends Asset {
    constructor(name, pkg, options) {
        super(name, pkg, options)

        const basename = path.basename(name)
        if (basename !== 'manifest.json') {
            return new JSONAsset(...arguments)
        }

        this.type = 'json'
        this.isAstDirty = false
        this.dependencyProcessors = {
            background: this.processBackground,
            content_scripts: this.processContentScripts,
            web_accessible_resources: this.processWebAccessibleResources,
            browser_action: this.processBrowserOrPageAction,
            page_action: this.processBrowserOrPageAction,
            icons: this.processIcons
        }
    }

    parse(code) {
        return JSON.parse(code)
    }

    processSingleDependency(path, opts) {
        opts = opts || { entry: true }
        return this.addURLDependency(path, opts)
    }

    processMultipleDependencies(filenames, opts) {
        return filenames.map(filename =>
            this.processSingleDependency(filename, opts)
        )
    }

    processBackground() {
        const background = this.ast.background
        if (Array.isArray(background.scripts)) {
            background.scripts = this.processMultipleDependencies(
                background.scripts
            )
        }
        if (background.page) {
            background.page = this.processSingleDependency(background.page)
        }
    }

    processContentScripts() {
        const contentScripts = this.ast.content_scripts
        if (!Array.isArray(contentScripts)) {
            return
        }
        for (const script of contentScripts) {
            if (script.js) {
                script.js = this.processMultipleDependencies(script.js)
            }
            if (script.css) {
                script.css = this.processMultipleDependencies(script.css)
            }
        }
    }

    processWebAccessibleResources() {
        const webAccessibleResources = this.ast.web_accessible_resources
        if (!Array.isArray(webAccessibleResources)) {
            return
        }
        this.ast.web_accessible_resources = this.processMultipleDependencies(
            webAccessibleResources
        )
    }

    processBrowserOrPageAction() {
        const action = this.ast.browser_action || this.ast.page_action || {}
        if (action.default_popup) {
            action.default_popup = this.processSingleDependency(
                action.default_popup
            )
        }
        if (action.default_icon) {
            action.default_icon = this.processSingleDependency(
                action.default_icon
            )
        }
    }

    processIcons() {
        const icons = this.ast.icons
        for (const size of Object.keys(icons)) {
            icons[size] = this.processSingleDependency(icons[size])
        }
    }

    collectDependenciesForWebExtension() {
        for (const nodeName of Object.keys(this.ast)) {
            const processor = this.dependencyProcessors[nodeName]
            if (processor) {
                processor.call(this)
                this.isAstDirty = true
            }
        }
    }

    collectDependenciesForPwa() {
        if (Array.isArray(this.ast.icons)) {
            for (let icon of this.ast.icons) {
                icon.src = this.addURLDependency(icon.src)
            }
        }

        if (Array.isArray(this.ast.screenshots)) {
            for (let shot of this.ast.screenshots) {
                shot.src = this.addURLDependency(shot.src)
            }
        }

        if (this.ast.serviceworker && this.ast.serviceworker.src) {
            this.ast.serviceworker.src = this.addURLDependency(
                this.ast.serviceworker.src
            )
        }
    }

    hasWebExtensionManifestKeys() {
        const requiredKeys = ['manifest_version', 'name', 'version']
        return requiredKeys.every(key => !!this.ast[key])
    }

    collectDependencies() {
        if (this.hasWebExtensionManifestKeys()) {
            this.collectDependenciesForWebExtension()
        } else {
            this.collectDependenciesForPwa()
        }
    }

    generate() {
        if (this.isAstDirty) {
            return JSON.stringify(this.ast)
        }

        return this.contents
    }
}

module.exports = ManifestAsset
