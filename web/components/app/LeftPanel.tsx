'use client';

import React, { useState, useEffect } from 'react';
import { Tree, Input, Spin, Empty, Button, Space, Typography } from 'antd';
import {
  PlusOutlined,
  SearchOutlined,
  DatabaseOutlined,
  AppstoreOutlined,
  FolderOutlined,
  FileOutlined,
} from '@ant-design/icons';
import type { DataNode } from 'antd/es/tree';
import { 
  fetchDomains, 
  fetchApplications, 
  fetchModules, 
  fetchObjects,
  Domain,
  ApplicationExt,
  ModuleExt,
  ObjectItemExt
} from '@/app/settings/app/api';

const { Text } = Typography;

interface LeftPanelProps {
  selectedKey: string | null;
  onSelect: (key: string, type: string, data: any) => void;
}

interface TreeNodeData {
  key: string;
  title: string;
  type: 'domain' | 'application' | 'module' | 'object';
  data: any;
  children?: TreeNodeData[];
  isLeaf?: boolean;
}

const LeftPanel: React.FC<LeftPanelProps> = ({ selectedKey, onSelect }) => {
  const [loading, setLoading] = useState(false);
  const [treeData, setTreeData] = useState<TreeNodeData[]>([]);
  const [expandedKeys, setExpandedKeys] = useState<string[]>([]);
  const [searchValue, setSearchValue] = useState('');

  // Load initial data
  useEffect(() => {
    loadDomains();
  }, []);

  const loadDomains = async () => {
    setLoading(true);
    try {
      const domains = await fetchDomains();
      const nodes: TreeNodeData[] = domains.map((domain: Domain) => ({
        key: `domain-${domain.id}`,
        title: domain.name,
        type: 'domain',
        data: domain,
        children: [],
        isLeaf: false,
      }));
      setTreeData(nodes);
      if (nodes.length > 0) {
        setExpandedKeys([nodes[0].key]);
        loadApplications(nodes[0].data as Domain);
      }
    } catch (error) {
      console.error('Failed to load domains:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadApplications = async (domain: Domain) => {
    try {
      const applications = await fetchApplications(domain.id);
      setTreeData(prev => prev.map(node => {
        if (node.key === `domain-${domain.id}`) {
          return {
            ...node,
            children: applications.map((app: ApplicationExt) => ({
              key: `app-${app.id}`,
              title: app.name,
              type: 'application',
              data: app,
              children: [],
              isLeaf: false,
            })),
          };
        }
        return node;
      }));
    } catch (error) {
      console.error('Failed to load applications:', error);
    }
  };

  const loadModules = async (app: ApplicationExt) => {
    try {
      const modules = await fetchModules(app.id);
      setTreeData(prev => prev.map(domain => ({
        ...domain,
        children: domain.children?.map((child: TreeNodeData) => {
          if (child.key === `app-${app.id}`) {
            return {
              ...child,
              children: modules.map((mod: ModuleExt) => ({
                key: `module-${mod.id}`,
                title: mod.name,
                type: 'module',
                data: mod,
                children: [],
                isLeaf: false,
              })),
            };
          }
          return child;
        }) || [],
      })));
    } catch (error) {
      console.error('Failed to load modules:', error);
    }
  };

  const loadObjects = async (mod: ModuleExt) => {
    try {
      const objects = await fetchObjects(mod.id);
      setTreeData(prev => prev.map(domain => ({
        ...domain,
        children: domain.children?.map((app: TreeNodeData) => ({
          ...app,
          children: app.children?.map((child: TreeNodeData) => {
            if (child.key === `module-${mod.id}`) {
              return {
                ...child,
                children: objects.map((obj: ObjectItemExt) => ({
                  key: `obj-${obj.objectId}`,
                  title: obj.objectName || '-',
                  type: 'object',
                  data: obj,
                  isLeaf: true,
                })),
              };
            }
            return child;
          }) || [],
        })) || [],
      })));
    } catch (error) {
      console.error('Failed to load objects:', error);
    }
  };

  const onExpand = (keys: React.Key[], info: any) => {
    setExpandedKeys(keys as string[]);
    const node = info.node as TreeNodeData;
    
    if (info.expanded) {
      if (node.type === 'domain' && (!node.children || node.children.length === 0)) {
        loadApplications(node.data as Domain);
      } else if (node.type === 'application' && (!node.children || node.children.length === 0)) {
        loadModules(node.data as ApplicationExt);
      } else if (node.type === 'module' && (!node.children || node.children.length === 0)) {
        loadObjects(node.data as ModuleExt);
      }
    }
  };

  const onTreeSelect = (keys: React.Key[], info: any) => {
    const key = keys[0] as string;
    if (key) {
      const node = info.node as TreeNodeData;
      onSelect(key, node.type, node.data);
    }
  };

  const convertToTreeData = (nodes: TreeNodeData[]): DataNode[] => {
    return nodes.map(node => {
      const isSelected = selectedKey === node.key;
      const icon = node.type === 'domain' 
        ? <DatabaseOutlined style={{ color: isSelected ? '#1890ff' : '#722ed1' }} />
        : node.type === 'application'
        ? <AppstoreOutlined style={{ color: isSelected ? '#1890ff' : '#52c41a' }} />
        : node.type === 'module'
        ? <FolderOutlined style={{ color: isSelected ? '#1890ff' : '#fa8c16' }} />
        : <FileOutlined style={{ color: isSelected ? '#1890ff' : '#13c2c2' }} />;

      return {
        key: node.key,
        title: (
          <Space>
            {icon}
            <Text 
              strong={node.type === 'application'}
              style={{ 
                color: isSelected ? '#1890ff' : undefined,
                fontSize: node.type === 'domain' ? 14 : 13
              }}
            >
              {node.title}
            </Text>
          </Space>
        ),
        isLeaf: node.isLeaf,
        children: node.children ? convertToTreeData(node.children) : undefined,
      };
    });
  };

  const filterTreeData = (nodes: TreeNodeData[], search: string): TreeNodeData[] => {
    if (!search) return nodes;
    
    return nodes.reduce<TreeNodeData[]>((acc, node) => {
      const match = node.title.toLowerCase().includes(search.toLowerCase());
      const filteredChildren = node.children ? filterTreeData(node.children, search) : [];
      
      if (match || filteredChildren.length > 0) {
        acc.push({ ...node, children: filteredChildren });
      }
      return acc;
    }, []);
  };

  const filteredTreeData = filterTreeData(treeData, searchValue);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#fff' }}>
      {/* Header */}
      <div style={{ padding: '16px 20px', borderBottom: '1px solid #f0f0f0', background: '#fafafa' }}>
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Space>
              <DatabaseOutlined style={{ fontSize: 18, color: '#1890ff' }} />
              <Text strong style={{ fontSize: 16 }}>Schema Explorer</Text>
            </Space>
            <Button type="primary" size="small" icon={<PlusOutlined />} ghost>
              Add
            </Button>
          </div>
          <Input
            placeholder="Search..."
            prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            allowClear
            size="small"
          />
        </Space>
      </div>

      {/* Tree */}
      <div style={{ flex: 1, overflow: 'auto', padding: '8px 0' }}>
        <Spin spinning={loading}>
          {filteredTreeData.length > 0 ? (
            <Tree
              showLine
              showIcon={false}
              expandedKeys={expandedKeys}
              onExpand={onExpand}
              selectedKeys={selectedKey ? [selectedKey] : []}
              onSelect={onTreeSelect}
              treeData={convertToTreeData(filteredTreeData)}
              blockNode
              style={{ padding: '0 12px' }}
            />
          ) : (
            <Empty description="No data found" image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ marginTop: 40 }} />
          )}
        </Spin>
      </div>
    </div>
  );
};

export default LeftPanel;
