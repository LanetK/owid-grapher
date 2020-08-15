import { observer } from "mobx-react"
import React from "react"
import { AdminLayout } from "admin/client/AdminLayout"
import {
    AdminAppContextType,
    AdminAppContext
} from "admin/client/AdminAppContext"
import { SwitcherExplorer } from "dataExplorer/client/SwitcherExplorer"
import { HotTable } from "@handsontable/react"
import { action, observable, computed, autorun } from "mobx"
import { ChartConfigProps } from "charts/ChartConfig"
import { JsTable } from "charts/Util"
import {
    ExplorerProgram,
    ProgramKeyword
} from "dataExplorer/client/ExplorerProgram"
import { readRemoteFile, writeRemoteFile } from "gitCms/client"
import { Prompt } from "react-router-dom"
import { Link } from "admin/client/Link"

@observer
export class ExplorerCreatePage extends React.Component<{ slug: string }> {
    static contextType = AdminAppContext
    context!: AdminAppContextType

    @action
    componentDidMount() {
        this.context.admin.loadingIndicatorSetting = "off"
        this.fetchExplorerProgramOnLoad()
        const win = window as any
        win.ExplorerProgram = ExplorerProgram
    }

    @action
    componentWillUnmount() {
        this.context.admin.loadingIndicatorSetting = "default"
    }

    @action.bound async fetchExplorerProgramOnLoad() {
        const content = await readRemoteFile({
            filepath: ExplorerProgram.fullPath(this.props.slug)
        })
        this.sourceOnDisk = content || ExplorerProgram.defaultExplorerProgram
        this.setProgram(this.sourceOnDisk)
    }

    @action.bound setProgram(code: string) {
        this.program = new ExplorerProgram(this.program.slug, code)
        this.fetchChartConfigs(this.program.requiredChartIds)
    }

    @action.bound async fetchChartConfigs(chartIds: number[]) {
        const missing = chartIds.filter(id => !this.chartConfigs.has(id))
        if (!missing.length) return
        const response = await fetch(
            `/admin/api/charts/explorer-charts.json?chartIds=${chartIds.join(
                "~"
            )}`
        )
        const configs = await response.json()
        configs.forEach((config: any) =>
            this.chartConfigs.set(config.id, config)
        )
    }

    @observable chartConfigs: Map<number, ChartConfigProps> = new Map()

    hotTableComponent = React.createRef<HotTable>()

    @action.bound updateConfig() {
        const newVersion = this.hotTableComponent.current?.hotInstance.getData() as JsTable
        if (newVersion) {
            const program = ExplorerProgram.fromArrays(
                this.program.slug,
                newVersion
            )
            if (this.program.toString() === program.toString()) return
            this.setProgram(program.toString())
        }
    }

    @observable sourceOnDisk: string = ExplorerProgram.defaultExplorerProgram

    @observable
    program: ExplorerProgram = new ExplorerProgram(this.props.slug, "")

    @action.bound async saveExplorer() {
        const slug = prompt("Slug for this explorer", this.program.slug)
        if (!slug) return
        this.context.admin.loadingIndicatorSetting = "loading"
        this.program.slug = slug
        await writeRemoteFile({
            filepath: this.program.fullPath,
            content: this.program.toString()
        })
        this.context.admin.loadingIndicatorSetting = "off"
        this.sourceOnDisk = this.program.toString()
    }

    @computed get isModified(): boolean {
        return this.sourceOnDisk !== this.program.toString()
    }

    render() {
        const data = this.program.toArrays()

        // Highlight the active view
        const activeViewRowNumber =
            this.program.getLineIndex(ProgramKeyword.switcher) +
            this.program.switcherRuntime.selectedRowIndex +
            3
        const hotStyles = `.ht_master tr:nth-child(${activeViewRowNumber}) > td:nth-child(3) {
            background-color: #bcf5bc;
          }`

        return (
            <AdminLayout title="Create Explorer">
                <Prompt
                    when={this.isModified}
                    message="Are you sure you want to leave? Unsaved changes will be lost."
                />
                <style dangerouslySetInnerHTML={{ __html: hotStyles }}></style>
                <main style={{ padding: 0, position: "relative" }}>
                    <div
                        style={{
                            right: "15px",
                            top: "5px",
                            position: "absolute",
                            zIndex: 2
                        }}
                    >
                        {this.isModified ? (
                            <button
                                className="btn btn-primary"
                                onClick={this.saveExplorer}
                            >
                                Save
                            </button>
                        ) : (
                            <button className="btn btn-secondary">
                                Unmodified
                            </button>
                        )}
                        <br />
                        <br />
                        <Link
                            target="preview"
                            to={`/explorers/preview/${this.program.slug}`}
                            className="btn btn-secondary"
                        >
                            Preview
                        </Link>
                    </div>
                    <div style={{ height: "500px", overflow: "scroll" }}>
                        <SwitcherExplorer
                            chartConfigs={this.chartConfigs}
                            bindToWindow={false}
                            program={this.program}
                        />
                    </div>
                    <div>
                        <HotTable
                            data={data}
                            manualColumnResize={[150, 150]}
                            wordWrap={false}
                            colHeaders={false}
                            contextMenu={true}
                            allowInsertRow={true}
                            allowInsertColumn={true}
                            width="100%"
                            stretchH="all"
                            minCols={8}
                            minRows={20}
                            ref={this.hotTableComponent as any}
                            rowHeaders={true}
                            afterChange={() => this.updateConfig()}
                            licenseKey={"non-commercial-and-evaluation"}
                        />
                    </div>
                </main>
            </AdminLayout>
        )
    }
}
