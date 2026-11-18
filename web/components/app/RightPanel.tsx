'use client';

import React, { useState, useEffect } from 'react';
import {
  Card,
  Form,
  Input,
  Select,
  Button,
  Space,
  Typography,
  Divider,
  Tag,
  Empty,
  List,
  Avatar,
  Badge,
  Row,
  Col,
  Spin,
  Tooltip
} from 'antd';
import {
  EditOutlined,
  SaveOutlined,
  CloseOutlined,
  PlusOutlined,
  DatabaseOutlined,
  AppstoreOutlined,
  FolderOutlined,
  FileOutlined,
  CheckCircleOutlined,
  StopOutlined,
  DeleteOutlined,
  EyeOutlined,
} from '@ant-design/icons';
import Swal from 'sweetalert2';
import { ObjectItemExt, fetchObjects } from '@/app/settings/app/api';

const { Title, Text } = Typography;
const { TextArea } = Input;
const { Option } = Select;

interface RightPanelProps {
  selectedType: string | null;
  selectedData: any;
}

const RightPanel: React.FC<RightPanelProps> = ({ selectedType, selectedData }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [objects, setObjects] = useState<ObjectItemExt[]>([]);

  // Load objects when module is selected
  useEffect(() => {
    if (selectedType === 'module' && selectedData) {
      loadObjects(selectedData.id);
    }
  }, [selectedType, selectedData]);

  // Reset form when data changes
  useEffect(() => {
    if (selectedData) {
      form.setFieldsValue({
        code: selectedData.code,
        name: selectedData.name,
        description: selectedData.description || '',
        status: selectedData.is_active === 1 ? 'ACTIVE' : 'INACTIVE',
      });
    }
    setIsEditing(false);
  }, [selectedData, form]);

  const loadObjects = async (moduleId: number) => {
    try {
      setLoading(true);
      const data = await fetchObjects(moduleId);
      setObjects(data);
    } catch (error) {
      console.error('Failed to load objects:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = () => {
    setIsEditing(true);
  };

  const handleCancel = () => {
    setIsEditing(false);
    if (selectedData) {
      form.setFieldsValue({
        code: selectedData.code,
        name: selectedData.name,
        description: selectedData.description || '',
        status: selectedData.is_active === 1 ? 'ACTIVE' : 'INACTIVE',
      });
    }
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);
      
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 500));
      void values; // suppress unused warning
      
      Swal.fire({
        icon: 'success',
        title: 'Saved',
        text: 'Changes saved successfully',
        timer: 1500,
        showConfirmButton: false,
        toast: true,
        position: 'top-end',
      });
      
      setIsEditing(false);
    } catch (error) {
      console.error('Save failed:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedData) return;
    
    const result = await Swal.fire({
      icon: 'warning',
      title: 'Confirm Delete?',
      text: `Delete "${selectedData.name}"?`,
      showCancelButton: true,
      confirmButtonText: 'Delete',
      cancelButtonText: 'Cancel',
      confirmButtonColor: '#dc2626',
    });
    
    if (result.isConfirmed) {
      try {
        setLoading(true);
        // Call delete API based on type
        Swal.fire({
          icon: 'success',
          title: 'Deleted',
          timer: 1500,
          showConfirmButton: false,
          toast: true,
          position: 'top-end',
        });
      } catch (error) {
        console.error('Delete failed:', error);
      } finally {
        setLoading(false);
      }
    }
  };

  const getStatusTag = (isActive: number) => {
    return isActive === 1 ? (
      <Tag icon={<CheckCircleOutlined />} color="success">Active</Tag>
    ) : (
      <Tag icon={<StopOutlined />} color="default">Inactive</Tag>
    );
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'domain': return <DatabaseOutlined style={{ fontSize: 32, color: '#722ed1' }} />;
      case 'application': return <AppstoreOutlined style={{ fontSize: 32, color: '#52c41a' }} />;
      case 'module': return <FolderOutlined style={{ fontSize: 32, color: '#fa8c16' }} />;
      case 'object': return <FileOutlined style={{ fontSize: 32, color: '#13c2c2' }} />;
      default: return null;
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'domain': return 'Domain';
      case 'application': return 'Application';
      case 'module': return 'Module';
      case 'object': return 'Object';
      default: return type;
    }
  };

  if (!selectedData) {
    return (
      <div style={{ 
        height: '100%', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        background: '#f5f5f5',
        padding: 24
      }}>
        <Empty
          description="Select an item from the tree to view details"
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        />
      </div>
    );
  }

  return (
    <Spin spinning={loading}>
      <div style={{ 
        padding: 24,
        background: '#f5f5f5',
        minHeight: '100%'
      }}>
        {/* Header Card */}
        <Card style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <Space size={16}>
              <div style={{ 
                width: 64, 
                height: 64, 
                borderRadius: 12,
                background: '#f0f5ff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                {getTypeIcon(selectedType || '')}
              </div>
              
              <div>
                <Space direction="vertical" size={4}>
                  <Space>
                    <Title level={4} style={{ margin: 0 }}>{selectedData.name}</Title>
                    {!isEditing && getStatusTag(selectedData.is_active)}
                  </Space>
                  <Space>
                    <Tag color="blue">{selectedData.code}</Tag>
                    <Text type="secondary">{getTypeLabel(selectedType || '')}</Text>
                    {selectedData.id && (
                      <Text type="secondary">ID: {selectedData.id}</Text>
                    )}
                  </Space>
                </Space>
              </div>
            </Space>

            <Space>
              {!isEditing ? (
                <>
                  <Button type="primary" icon={<EditOutlined />} onClick={handleEdit}>
                    Edit
                  </Button>
                  <Button danger icon={<DeleteOutlined />} onClick={handleDelete}>
                    Delete
                  </Button>
                </>
              ) : (
                <>
                  <Button icon={<CloseOutlined />} onClick={handleCancel}>
                    Cancel
                  </Button>
                  <Button type="primary" icon={<SaveOutlined />} onClick={handleSave}>
                    Save
                  </Button>
                </>
              )}
            </Space>
          </div>

          <Divider />

          {/* Form */}
          <Form
            form={form}
            layout="vertical"
            disabled={!isEditing}
          >
            <Row gutter={24}>
              <Col span={12}>
                <Form.Item
                  label="Code"
                  name="code"
                  rules={[{ required: true, message: 'Please enter code' }]}
                >
                  <Input placeholder="e.g. USER_MGMT" />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item
                  label="Name"
                  name="name"
                  rules={[{ required: true, message: 'Please enter name' }]}
                >
                  <Input placeholder="e.g. User Management" />
                </Form.Item>
              </Col>
            </Row>

            <Form.Item
              label="Description"
              name="description"
            >
              <TextArea rows={3} placeholder="Enter description" />
            </Form.Item>

            <Form.Item
              label="Status"
              name="status"
              rules={[{ required: true }]}
            >
              <Select style={{ width: 200 }}>
                <Option value="ACTIVE">
                  <Space>
                    <Badge status="success" />
                    Active
                  </Space>
                </Option>
                <Option value="INACTIVE">
                  <Space>
                    <Badge status="default" />
                    Inactive
                  </Space>
                </Option>
              </Select>
            </Form.Item>
          </Form>
        </Card>

        {/* Objects Section - Only show for module */}
        {selectedType === 'module' && (
          <Card
            title={
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Space>
                  <FileOutlined style={{ color: '#52c41a' }} />
                  <Text strong style={{ textTransform: 'uppercase', fontSize: 14 }}>
                    Objects
                  </Text>
                  <Badge count={objects.length} style={{ backgroundColor: '#52c41a' }} />
                </Space>
                <Button type="primary" size="small" icon={<PlusOutlined />} ghost>
                  Add Object
                </Button>
              </div>
            }
          >
            <List
              dataSource={objects}
              renderItem={(item) => (
                <List.Item
                  actions={[
                    <Tooltip title="View" key="view">
                      <Button type="text" icon={<EyeOutlined />} size="small" />
                    </Tooltip>,
                    <Tooltip title="Edit" key="edit">
                      <Button type="text" icon={<EditOutlined />} size="small" />
                    </Tooltip>,
                  ]}
                >
                  <List.Item.Meta
                    avatar={
                      <Avatar 
                        icon={<FileOutlined />} 
                        style={{ backgroundColor: '#f6ffed', color: '#52c41a' }}
                      />
                    }
                    title={
                      <Space>
                        <Text strong>{item.objectName}</Text>
                        {item.objectTypeName && (
                          <Tag color="blue" style={{ fontSize: 12 }}>{item.objectTypeName}</Tag>
                        )}
                      </Space>
                    }
                    description={
                      <Space>
                        {item.path && <Text type="secondary" copyable>{item.path}</Text>}
                      </Space>
                    }
                  />
                </List.Item>
              )}
            />
          </Card>
        )}
      </div>
    </Spin>
  );
};

export default RightPanel;
