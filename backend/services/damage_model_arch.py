"""
damage_model_arch.py -- the exact Siamese CNN architecture used in Notebook 03. This file
defines the architecture ONLY; it does not train anything. It exists purely so
damage_model.pt's saved weights can be loaded into a matching structure.

Verified against the actual uploaded damage_model.pt: classifier.0.weight shape is
(256, 1024), confirming resnet18 (feat_dim=512) with plain concatenation (512*2=1024) --
NOT the resnet34 or difference-feature variant that was tried and reverted during training.
"""
import torch
import torch.nn as nn
from torchvision.models import resnet18


class SiameseDamageNet(nn.Module):
    def __init__(self, num_classes=4):
        super().__init__()
        backbone = resnet18(weights=None)
        self.encoder = nn.Sequential(*list(backbone.children())[:-1])
        feat_dim = backbone.fc.in_features
        self.classifier = nn.Sequential(
            nn.Linear(feat_dim * 2, 256), nn.ReLU(), nn.Dropout(0.4),
            nn.Linear(256, 128), nn.ReLU(), nn.Dropout(0.3),
            nn.Linear(128, num_classes)
        )

    def forward(self, pre_img, post_img):
        pre_feat = self.encoder(pre_img).flatten(1)
        post_feat = self.encoder(post_img).flatten(1)
        combined = torch.cat([pre_feat, post_feat], dim=1)
        return self.classifier(combined)
