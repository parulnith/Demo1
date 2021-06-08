# src/create_folds.py
import pandas as pd
from sklearn import model_selection

if __name__ == "__main__":
    df = pd.read_csv("../input/mnist_train.csv")
    df["kfold"] = -1
    df = df.sample(frac=1).reset_index(drop=True)
    kf = model_selection.KFold(n_splits=5)
    for fold, (trn_, val_) in enumerate(kf.split(X=df)):
        df.loc[val_, "kfold"] = fold
    df.to_csv("../input/mnist_train_folds.csv", index=False)
