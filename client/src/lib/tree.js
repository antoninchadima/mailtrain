'use strict';

import React, { Component } from 'react';
import ReactDOMServer from 'react-dom/server';
import { translate } from 'react-i18next';
import PropTypes from 'prop-types';

import jQuery from 'jquery';
import '../../public/jquery/jquery-ui-1.12.1.min.js';
import '../../public/fancytree/jquery.fancytree-all.min.js';
import '../../public/fancytree/skin-bootstrap/ui.fancytree.min.css';
import './tree.css';
import axios from './axios';

import { withPageHelpers } from '../lib/page'
import { withErrorHandling, withAsyncErrorHandler } from './error-handling';

const TreeSelectMode = {
    NONE: 0,
    SINGLE: 1,
    MULTI: 2
};

@translate()
@withPageHelpers
@withErrorHandling
class TreeTable extends Component {
    constructor(props) {
        super(props);

        this.state = {
            treeData: []
        };

        if (props.data) {
            this.state.treeData = props.data;
        }

        // Select Mode simply cannot be changed later. This is just to make sure we avoid inconsistencies if someone changes it anyway.
        this.selectMode = this.props.selectMode;
    }

    static defaultProps = {
        selectMode: TreeSelectMode.NONE 
    }

    @withAsyncErrorHandler
    async loadData(dataUrl) {
        const response = await axios.get(dataUrl);
        const treeData = response.data;

        treeData.expanded = true;
        for (const child of treeData.children) {
            child.expanded = true;
        }

        this.setState({
            treeData: [ response.data ]
        });
    }

    static propTypes = {
        dataUrl: PropTypes.string,
        data: PropTypes.array,
        selectMode: PropTypes.number,
        selection: PropTypes.oneOfType([PropTypes.array, PropTypes.string, PropTypes.number]),
        onSelectionChangedAsync: PropTypes.func,
        actionLinks: PropTypes.array,
        withHeader: PropTypes.bool
    }

    componentWillReceiveProps(nextProps) {
        if (nextProps.data) {
            this.setState({
                treeData: nextProps.data
            });
        } else if (nextProps.dataUrl && this.props.dataUrl !== nextProps.dataUrl) {
            this.loadData(next.props.dataUrl);
        }
    }

    shouldComponentUpdate(nextProps, nextState) {
        return this.props.selection !== nextProps.selection || this.state.treeData != nextState.treeData;
    }

    componentDidMount() {
        if (!this.props.data && this.props.dataUrl) {
            this.loadData(this.props.dataUrl);
        }

        const glyphOpts = {
            map: {
                expanderClosed: 'glyphicon glyphicon-menu-right',
                expanderLazy: 'glyphicon glyphicon-menu-right',  // glyphicon-plus-sign
                expanderOpen: 'glyphicon glyphicon-menu-down',  // glyphicon-collapse-down
                checkbox: 'glyphicon glyphicon-unchecked',
                checkboxSelected: 'glyphicon glyphicon-check',
                checkboxUnknown: 'glyphicon glyphicon-share',                
            }
        };

        let createNodeFn;
        if (this.props.actionLinks) {
            const actionLinks = this.props.actionLinks;

            createNodeFn = (event, data) => {
                const node = data.node;
                const tdList = jQuery(node.tr).find(">td");

                const linksContainer = jQuery('<span class="mt-action-links"/>');
                for (const {label, link} of actionLinks) {
                    const dest = link(node.key);
                    const lnkHtml = ReactDOMServer.renderToStaticMarkup(<a href={dest}>{label}</a>);
                    const lnk = jQuery(lnkHtml);
                    lnk.click((evt) => { evt.preventDefault(); this.navigateTo(dest) });
                    linksContainer.append(lnk);
                }

                tdList.eq(1).html(linksContainer);
            };
        } else {
            createNodeFn = (event, data) => {};
        }

        this.tree = jQuery(this.domTable).fancytree({
            extensions: ['glyph', 'table'],
            glyph: glyphOpts,
            selectMode: (this.selectMode === TreeSelectMode.MULTI ? 2 : 1),
            icon: false,
            autoScroll: true,
            scrollParent: jQuery(this.domTableContainer),
            source: this.state.treeData,
            table: {
                nodeColumnIdx: 0
            },
            createNode: createNodeFn,
            checkbox: this.selectMode === TreeSelectMode.MULTI,
            activate: (this.selectMode === TreeSelectMode.SINGLE ? ::this.onActivate : null),
            select: (this.selectMode === TreeSelectMode.MULTI ? ::this.onSelect : null)
        }).fancytree("getTree");

        this.updateSelection();
    }

    componentDidUpdate() {
        this.tree.reload(this.state.treeData);
        this.updateSelection();
    }

    updateSelection() {
        const tree = this.tree;
        if (this.selectMode === TreeSelectMode.MULTI) {
            const selectSet = new Set(this.props.selection);

            tree.enableUpdate(false);
            tree.visit(node => node.setSelected(selectSet.has(node.key)));
            tree.enableUpdate(true);

        } else if (this.selectMode === TreeSelectMode.SINGLE) {
            this.tree.activateKey(this.props.selection);
        }
    }

    @withAsyncErrorHandler
    async onSelectionChanged(sel) {
        if (this.props.onSelectionChangedAsync) {
            await this.props.onSelectionChangedAsync(sel);
        }
    }

    // Single-select
    onActivate(event, data) {
        const selection = this.tree.getActiveNode().key;
        if (selection !== this.props.selection) {
            this.onSelectionChanged(selection);
        }
    }

    // Multi-select
    onSelect(event, data) {
        const newSel = this.tree.getSelectedNodes().map(node => node.key).sort();
        const oldSel = this.props.selection;

        let updated = false;
        const length = oldSel.length;
        if (length === newSel.length) {
            for (let i = 0; i < length; i++) {
                if (oldSel[i] !== newSel[i]) {
                    updated = true;
                    break;
                }
            }
        } else {
            updated = true;
        }

        if (updated) {
            this.onSelectionChanged(selection);
        }
    }

    render() {
        const t = this.props.t;
        const props = this.props;
        const actionLinks = props.actionLinks;
        const withHeader = props.withHeader;

        let containerClass = 'mt-treetable-container';
        if (this.selectMode === TreeSelectMode.NONE) {
            containerClass += ' mt-treetable-inactivable';
        }

        if (!this.withHeader) {
            containerClass += ' mt-treetable-noheader';
        }

        // FIXME: style={{ height: '100px', overflow: 'auto'}}

        const container =
            <div className={containerClass} ref={(domElem) => { this.domTableContainer = domElem; }} >
                <table ref={(domElem) => { this.domTable = domElem; }} className="table table-hover table-striped table-condensed">
                    {props.withHeader &&
                        <thead>
                            <tr>
                                <th>{t('Name')}</th>
                                {actionLinks && <th></th>}
                            </tr>
                        </thead>
                    }
                    <tbody>
                    <tr>
                        <td></td>
                        {actionLinks && <td></td>}
                    </tr>
                    </tbody>
                </table>
            </div>;

        return (
            container
        );
    }
}

export {
    TreeTable,
    TreeSelectMode
}