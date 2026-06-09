import io
import json
import pytest
from unittest.mock import patch, MagicMock
from api.models import MLModel


MODELS_URL = '/api/models/'
CLEAR_URL = '/api/models/clear/'


class TestMLModelListView:
    def test_list_empty(self, auth_client, db):
        response = auth_client.get(MODELS_URL)
        assert response.status_code == 200
        assert response.data == []

    def test_list_active_models(self, auth_client, ml_model):
        response = auth_client.get(MODELS_URL)
        assert response.status_code == 200
        assert len(response.data) == 1
        assert response.data[0]['name'] == ml_model.name

    def test_list_excludes_inactive(self, auth_client, ml_model):
        ml_model.is_active = False
        ml_model.save()
        response = auth_client.get(MODELS_URL)
        assert response.status_code == 200
        assert response.data == []

    def test_list_unauthenticated(self, api_client, db):
        response = api_client.get(MODELS_URL)
        assert response.status_code == 401

    def test_list_response_fields(self, auth_client, ml_model):
        response = auth_client.get(MODELS_URL)
        assert response.status_code == 200
        item = response.data[0]
        assert 'id' in item
        assert 'name' in item
        assert 'model_type' in item
        assert 'description' in item
        assert 'metrics' in item
        assert 'created_at' in item


class TestMLModelUpload:
    def _make_fake_joblib(self):
        """Returns a fake .joblib file-like object with a sklearn LogisticRegression."""
        import joblib
        import tempfile
        from sklearn.linear_model import LogisticRegression
        import numpy as np

        clf = LogisticRegression()
        clf.fit([[0, 0], [1, 1]], [0, 1])

        buf = io.BytesIO()
        with tempfile.NamedTemporaryFile(suffix='.joblib', delete=False) as f:
            joblib.dump(clf, f.name)
            with open(f.name, 'rb') as jf:
                buf.write(jf.read())
        buf.seek(0)
        buf.name = 'model.joblib'
        return buf

    def _make_metadata(self, feature_names=None):
        metadata = {
            'feature_names': feature_names or ['f1', 'f2'],
            'metrics': {'roc_auc': 0.80},
            'thresholds': {'low': 0.07, 'medium': 0.14},
        }
        buf = io.BytesIO(json.dumps(metadata).encode())
        buf.name = 'metadata.json'
        return buf

    def test_upload_missing_name(self, auth_client, db):
        response = auth_client.post(MODELS_URL, {
            'joblib_file': self._make_fake_joblib(),
            'metadata_file': self._make_metadata(),
        }, format='multipart')
        assert response.status_code == 400
        assert 'detail' in response.data

    def test_upload_missing_joblib(self, auth_client, db):
        response = auth_client.post(MODELS_URL, {
            'name': 'NoFile',
            'metadata_file': self._make_metadata(),
        }, format='multipart')
        assert response.status_code == 400

    def test_upload_missing_metadata(self, auth_client, db):
        response = auth_client.post(MODELS_URL, {
            'name': 'NoMeta',
            'joblib_file': self._make_fake_joblib(),
        }, format='multipart')
        assert response.status_code == 400

    def test_upload_invalid_metadata_json(self, auth_client, db):
        bad_meta = io.BytesIO(b'not valid json')
        bad_meta.name = 'metadata.json'
        response = auth_client.post(MODELS_URL, {
            'name': 'BadMeta',
            'joblib_file': self._make_fake_joblib(),
            'metadata_file': bad_meta,
        }, format='multipart')
        assert response.status_code == 400

    @patch('api.views.shutil.move')
    @patch('api.views.os.makedirs')
    def test_upload_success(self, mock_makedirs, mock_move, auth_client, db):
        response = auth_client.post(MODELS_URL, {
            'name': 'UploadedLR',
            'joblib_file': self._make_fake_joblib(),
            'metadata_file': self._make_metadata(),
        }, format='multipart')
        assert response.status_code in (200, 201)
        assert MLModel.objects.filter(name='UploadedLR').exists()

    def test_upload_invalid_joblib_file(self, auth_client, db):
        bad_joblib = io.BytesIO(b'this is not a joblib file at all')
        bad_joblib.name = 'model.joblib'
        response = auth_client.post(MODELS_URL, {
            'name': 'BadJoblib',
            'joblib_file': bad_joblib,
            'metadata_file': self._make_metadata(),
        }, format='multipart')
        assert response.status_code == 400


class TestMLModelDetailView:
    def test_delete_existing_model(self, auth_client, ml_model):
        url = f'{MODELS_URL}{ml_model.id}/'
        response = auth_client.delete(url)
        assert response.status_code == 204
        assert not MLModel.objects.filter(id=ml_model.id).exists()

    def test_delete_nonexistent_model(self, auth_client, db):
        response = auth_client.delete(f'{MODELS_URL}99999/')
        assert response.status_code == 404

    def test_delete_unauthenticated(self, api_client, ml_model):
        url = f'{MODELS_URL}{ml_model.id}/'
        response = api_client.delete(url)
        assert response.status_code == 401

    def test_delete_removes_file_if_exists(self, auth_client, db, tmp_path):
        fake_file = tmp_path / 'model.joblib'
        fake_file.write_bytes(b'fake')
        model = MLModel.objects.create(
            name='FileModel',
            model_type='lgbm',
            joblib_path=str(fake_file),
            feature_names=[],
            metrics={},
            thresholds={},
        )
        response = auth_client.delete(f'{MODELS_URL}{model.id}/')
        assert response.status_code == 204
        assert not fake_file.exists()


class TestMLModelClearView:
    def test_clear_all_models(self, auth_client, ml_model):
        response = auth_client.delete(CLEAR_URL)
        assert response.status_code == 200
        assert response.data['deleted'] == 1
        assert MLModel.objects.count() == 0

    def test_clear_empty(self, auth_client, db):
        response = auth_client.delete(CLEAR_URL)
        assert response.status_code == 200
        assert response.data['deleted'] == 0

    def test_clear_unauthenticated(self, api_client, db):
        response = api_client.delete(CLEAR_URL)
        assert response.status_code == 401
